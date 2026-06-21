from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List
import os
import sys
import subprocess
import shutil
import time
import base64
import json
import tempfile
import urllib.parse
import httpx
import ast
from pathlib import Path

# Load .env from parent directory so we can use GEMINI_API_KEY locally
try:
    from dotenv import load_dotenv
    env_path = Path(__file__).parent.parent / ".env"
    load_dotenv(dotenv_path=env_path)
    print(f"[OK] Loaded .env from: {env_path}")
except Exception as e:
    print(f"[WARN] Could not load .env: {e}")

app = FastAPI(title="Jarvis Local System Agent")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

class LocalCommand(BaseModel):
    action: str              # play_spotify | open_app | read_screen | open_whatsapp | open_telegram | open_instagram | organize_files
    target: str = ""         # song name / app name / folder path
    rules: Optional[List] = []
    message: str = ""
    phone: str = ""
    username: str = ""
    question: str = ""       # question to ask Gemini about the screen

# ───────────────────────────────────────────
# App registry
# ───────────────────────────────────────────
APP_PROTOCOLS = {
    "whatsapp":  "whatsapp:",
    "telegram":  "tg:",
    "spotify":   "spotify:",
    "youtube":   "https://www.youtube.com",
    "chrome":    "chrome",
    "notepad":   "notepad",
    "calculator":"calc",
    "explorer":  "explorer",
    "paint":     "mspaint",
}

APP_EXECUTABLES = {
    "telegram": [
        os.path.expandvars(r"%APPDATA%\Telegram Desktop\Telegram.exe"),
        r"C:\Program Files\Telegram Desktop\Telegram.exe",
    ],
    "chrome": [
        r"C:\Program Files\Google\Chrome\Application\chrome.exe",
        r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    ],
}

# ───────────────────────────────────────────
# Helpers
# ───────────────────────────────────────────
def launch_uri(uri: str) -> bool:
    """Launch any URI using Windows shell 'start' command."""
    try:
        result = subprocess.run(f'cmd /c start "" "{uri}"', shell=True, timeout=5)
        return result.returncode == 0
    except Exception:
        pass
    try:
        os.startfile(uri)
        return True
    except Exception:
        pass
    return False

def launch_store_app(app_id: str) -> bool:
    """Launch a Windows Store app by searching its package name via PowerShell."""
    try:
        # Pass as list to avoid shell quote-stripping issues
        ps_script = (
            f'$app = Get-AppxPackage | '
            f'Where-Object {{$_.Name -like "*{app_id}*"}} | '
            f'Select-Object -First 1; '
            f'if ($app) {{ '
            f'$fam = $app.PackageFamilyName; '
            f'explorer.exe "shell:AppsFolder\\$($fam)!App" '
            f'}}'
        )
        result = subprocess.run(
            ["powershell", "-NoProfile", "-Command", ps_script],
            timeout=10,
            capture_output=True,
            text=True
        )
        print(f"launch_store_app stdout: {result.stdout}")
        print(f"launch_store_app stderr: {result.stderr}")
        return True  # Return True even if returncode != 0 since explorer launch is async
    except Exception as e:
        print(f"launch_store_app error: {e}")
        return False

def launch_executable(app_name: str) -> bool:
    """Try to launch app by known executable path."""
    paths = APP_EXECUTABLES.get(app_name.lower(), [])
    for path in paths:
        if os.path.exists(path):
            subprocess.Popen([path])
            return True
    return False

def take_screenshot() -> str:
    """Take a screenshot and return path to the saved PNG file."""
    try:
        from PIL import ImageGrab
        screenshot = ImageGrab.grab()
        tmp_path = os.path.join(tempfile.gettempdir(), "jarvis_screen.png")
        screenshot.save(tmp_path)
        return tmp_path
    except Exception as e:
        raise RuntimeError(f"Failed to take screenshot: {e}")

def analyze_screenshot_with_gemini(image_path: str, question: str) -> str:
    """Send screenshot to Gemini Vision and get an answer to the question."""
    gemini_key = os.environ.get("GEMINI_API_KEY", "")
    if not gemini_key:
        raise RuntimeError("GEMINI_API_KEY not found. Make sure .env is loaded.")

    with open(image_path, "rb") as f:
        img_b64 = base64.b64encode(f.read()).decode("utf-8")

    payload = {
        "contents": [{
            "parts": [
                {"text": f"You are a screen reading assistant. Look at this screenshot and answer the following question accurately: {question}"},
                {"inline_data": {"mime_type": "image/png", "data": img_b64}}
            ]
        }]
    }

    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key={gemini_key}"
    with httpx.Client(timeout=30.0) as client:
        response = client.post(url, json=payload)
        if response.status_code != 200:
            raise RuntimeError(f"Gemini Vision API error: {response.text[:300]}")
        result = response.json()
        return result["candidates"][0]["content"]["parts"][0]["text"]

def find_and_click(target_description: str) -> bool:
    """Takes a screenshot, asks Gemini for bounding box, and clicks it."""
    try:
        import pyautogui
    except ImportError:
        print("pyautogui not installed")
        return False
        
    screenshot_path = take_screenshot()
    gemini_key = os.environ.get("GEMINI_API_KEY", "")
    
    with open(screenshot_path, "rb") as f:
        img_b64 = base64.b64encode(f.read()).decode("utf-8")
        
    prompt = f"Find '{target_description}' on this screen. Return ONLY a Python list of the bounding box coordinates [ymin, xmin, ymax, xmax] scaled from 0 to 1000. Do not include any other text. If not found, return 'NOT_FOUND'."
    
    payload = {
        "contents": [{
            "parts": [
                {"text": prompt},
                {"inline_data": {"mime_type": "image/png", "data": img_b64}}
            ]
        }]
    }

    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key={gemini_key}"
    try:
        with httpx.Client(timeout=30.0) as client:
            response = client.post(url, json=payload)
            if response.status_code == 200:
                text = response.json()["candidates"][0]["content"]["parts"][0]["text"].strip()
                if text != "NOT_FOUND":
                    text = text.replace('```python', '').replace('```', '').strip()
                    bbox = ast.literal_eval(text)
                    if isinstance(bbox, list) and len(bbox) == 4:
                        screen_w, screen_h = pyautogui.size()
                        ymin, xmin, ymax, xmax = bbox
                        center_x = int(((xmin + xmax) / 2000.0) * screen_w)
                        center_y = int(((ymin + ymax) / 2000.0) * screen_h)
                        pyautogui.moveTo(center_x, center_y, duration=0.5)
                        pyautogui.click()
                        return True
    except Exception as e:
        print(f"find_and_click error: {e}")
    finally:
        try: os.remove(screenshot_path)
        except: pass
    return False


# ───────────────────────────────────────────
# Main endpoint
# ───────────────────────────────────────────
@app.get("/health")
def health():
    return {"status": "ok", "service": "local_agent", "version": "3.0"}

@app.post("/execute")
def execute(cmd: LocalCommand):
    action = cmd.action.lower().strip()
    target = cmd.target.strip() if cmd.target else ""
    rules  = cmd.rules or []

    try:
        # ─── READ SCREEN ──────────────────────────────────────────
        if action == "read_screen":
            question = cmd.question or target or "What do you see on the screen? Describe it in detail."
            wait_secs = 3  # Give any launched app time to load

            # If an app was just opened, give it a moment to render
            time.sleep(wait_secs)
            screenshot_path = take_screenshot()
            answer = analyze_screenshot_with_gemini(screenshot_path, question)
            try:
                os.remove(screenshot_path)
            except Exception:
                pass
            return {
                "status": "success",
                "message": f"📸 Screen read complete.",
                "answer": answer,
                "action_type": "read_screen"
            }

        # ─── OPEN APP + READ SCREEN ───────────────────────────────
        elif action == "open_and_read":
            app_name = target.lower()
            if "inst" in app_name and "gram" in app_name:
                opened = launch_store_app("Instagram")
                if not opened: launch_uri("https://www.instagram.com")
            elif "spotify" in app_name:
                launch_uri("https://open.spotify.com")
            elif "whatsapp" in app_name:
                launch_uri("whatsapp:")
            elif "telegram" in app_name:
                if not launch_uri("tg:"): launch_executable("telegram")
            else:
                launch_uri(APP_PROTOCOLS.get(app_name, app_name))

            time.sleep(5)
            question = cmd.question or f"What do you see on the screen in {target}? Describe the content."
            screenshot_path = take_screenshot()
            answer = analyze_screenshot_with_gemini(screenshot_path, question)
            try: os.remove(screenshot_path)
            except Exception: pass
            return {
                "status": "success",
                "message": f"📸 Opened {target} and read screen.",
                "answer": answer,
                "action_type": "open_and_read"
            }

        # ─── SPOTIFY ──────────────────────────────────────────────
        elif action == "play_spotify":
            if not target:
                # Just open Spotify main page if no song is specified
                launch_uri("https://open.spotify.com")
                return {"status": "success", "message": "[OK] Opened Spotify", "action_type": "spotify"}

            query = urllib.parse.quote(target)
            
            # Use web app URL (which will automatically deep-link if native app exists)
            opened = launch_uri(f"https://open.spotify.com/search/{query}")
                
            if not opened:
                raise HTTPException(status_code=500, detail="Failed to open Spotify.")
                
            # Wait for it to load, then use Vision to find and click the Play button
            time.sleep(8)
            print("[INFO] Attempting to auto-play using Gemini Vision...")
            find_and_click("the large green circular Play button in the top result area")
            
            return {"status": "success", "message": f"[OK] Opened Spotify and played: '{target}'", "action_type": "spotify"}

        # ─── WHATSAPP ─────────────────────────────────────────────
        elif action == "open_whatsapp" or (action == "open_app" and "whatsapp" in target.lower()):
            if cmd.message and cmd.phone:
                phone_clean = cmd.phone.replace("+", "").replace(" ", "")
                msg_enc = urllib.parse.quote(cmd.message)
                uri = f"whatsapp://send?phone={phone_clean}&text={msg_enc}"
            elif cmd.message:
                msg_enc = urllib.parse.quote(cmd.message)
                uri = f"whatsapp://send?text={msg_enc}"
            else:
                uri = "whatsapp:"
            launch_uri(uri)
            return {"status": "success", "message": f"✅ Opened WhatsApp" + (f" with message: '{cmd.message}'" if cmd.message else ""), "action_type": "whatsapp"}

        # ─── TELEGRAM ─────────────────────────────────────────────
        elif action == "open_telegram" or (action == "open_app" and "telegram" in target.lower()):
            if cmd.username and cmd.message:
                msg_enc = urllib.parse.quote(cmd.message)
                uri = f"tg://resolve?domain={cmd.username}&text={msg_enc}"
            elif cmd.username:
                uri = f"tg://resolve?domain={cmd.username}"
            else:
                uri = "tg:"
            if not launch_uri(uri):
                if not launch_executable("telegram"):
                    raise HTTPException(status_code=500, detail="Failed to open Telegram.")
            return {"status": "success", "message": f"✅ Opened Telegram" + (f" to @{cmd.username}" if cmd.username else ""), "action_type": "telegram"}

        # ─── INSTAGRAM ────────────────────────────────────────────
        elif action == "open_instagram" or (action == "open_app" and "instagram" in target.lower()):
            opened = launch_store_app("Instagram")
            if not opened:
                launch_uri("https://www.instagram.com")
            return {"status": "success", "message": "✅ Opened Instagram", "action_type": "instagram"}

        # ─── GENERIC APP LAUNCHER ─────────────────────────────────
        elif action == "open_app":
            app_key = target.lower()
            protocol = APP_PROTOCOLS.get(app_key)
            if protocol and launch_uri(protocol):
                return {"status": "success", "message": f"✅ Opened {target}", "action_type": "open_app"}
            try:
                subprocess.Popen(app_key, shell=True)
                return {"status": "success", "message": f"✅ Launched {target}", "action_type": "open_app"}
            except Exception as e:
                raise HTTPException(status_code=500, detail=f"Could not open '{target}': {str(e)}")

        # ─── FILE ORGANIZER ───────────────────────────────────────
        elif action == "organize_files":
            target_dir = Path(target) if target else Path.home() / "Downloads"
            if not target_dir.exists() or not target_dir.is_dir():
                raise HTTPException(status_code=400, detail=f"Directory does not exist: {target_dir}")
            safe_roots = ["downloads", "desktop", "documents", "users"]
            if not any(safe in str(target_dir).lower() for safe in safe_roots):
                raise HTTPException(status_code=403, detail="Directory not in safe allowed list.")
            moves = 0
            for rule in rules:
                exts = rule.get("extension", [])
                dest_name = rule.get("destination", "Organized")
                dest_dir = target_dir / dest_name
                dest_dir.mkdir(parents=True, exist_ok=True)
                for ext in exts:
                    for filepath in target_dir.glob(f"*{ext}"):
                        if filepath.is_file():
                            shutil.move(str(filepath), str(dest_dir / filepath.name))
                            moves += 1
            return {"status": "success", "message": f"✅ Moved {moves} files in {target_dir.name}", "action_type": "file_management"}

        else:
            raise HTTPException(status_code=400, detail=f"Unknown action: '{action}'")

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    print("[INFO] Jarvis Local Agent v3.0 starting on port 8004...")
    uvicorn.run("main:app", host="0.0.0.0", port=8004, reload=True)
