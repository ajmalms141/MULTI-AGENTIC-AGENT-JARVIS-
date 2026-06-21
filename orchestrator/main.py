from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="Jarvis Orchestrator")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

import os
import json
import sqlite3
import httpx
from fastapi import HTTPException

# SQLite database setup
DB_PATH = os.environ.get("SQLITE_DB_PATH", "/data/audit.db")

def init_db():
    try:
        os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        c.execute('''
            CREATE TABLE IF NOT EXISTS audit_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                command TEXT,
                intent TEXT,
                status TEXT,
                response_data TEXT
            )
        ''')
        conn.commit()
        conn.close()
    except Exception as e:
        print(f"Failed to initialize SQLite database: {e}")

# Run DB initialization
init_db()

@app.get("/health")
def health():
    return {"status": "ok", "service": "orchestrator"}

@app.get("/audit")
def get_audit_logs():
    try:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        c = conn.cursor()
        c.execute("SELECT id, timestamp, command, intent, status, response_data FROM audit_logs ORDER BY timestamp DESC LIMIT 30")
        rows = c.fetchall()
        conn.close()
        
        logs = []
        for r in rows:
            logs.append({
                "id": r["id"],
                "timestamp": r["timestamp"],
                "command": r["command"],
                "intent": r["intent"],
                "status": r["status"],
                "response_data": json.loads(r["response_data"]) if r["response_data"] else {}
            })
        return {"status": "success", "logs": logs}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to retrieve audit logs: {str(e)}")

def write_audit_log(command: str, intent: str, status: str, response_data: dict):
    try:
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        c.execute(
            "INSERT INTO audit_logs (command, intent, status, response_data) VALUES (?, ?, ?, ?)",
            (command, intent, status, json.dumps(response_data))
        )
        conn.commit()
        conn.close()
    except Exception as e:
        print(f"Failed to write audit log: {e}")

async def call_gemini(system_prompt: str, user_prompt: str, json_mode: bool = False) -> str:
    gemini_key = os.environ.get("GEMINI_API_KEY")
    if not gemini_key:
        raise ValueError("Gemini API key is missing.")
        
    payload = {
        "contents": [{
            "parts": [{"text": f"{system_prompt}\n\n{user_prompt}"}]
        }]
    }
    if json_mode:
        payload["generationConfig"] = {"responseMimeType": "application/json"}
        
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={gemini_key}"
    async with httpx.AsyncClient() as client:
        response = await client.post(url, json=payload, timeout=25.0)
        if response.status_code != 200:
            raise ValueError(f"Gemini API Error: {response.text}")
        result = response.json()
        return result["candidates"][0]["content"]["parts"][0]["text"]

@app.post("/command")
async def command(body: dict):
    text = body.get("text", "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="Command text is required")
        
    steps = ["Parsed command text."]
    intent = "unknown"
    response_payload = {}
    
    # 1. Parse intent using Gemini
    system_prompt = (
        "You are the JARVIS Assistant Router. Analyze the user command and categorize the request. "
        "Extract these properties and return a clean JSON object:\n"
        "- intent: one of 'price_compare', 'presentation', 'email_draft', 'price_compare_and_email', 'presentation_and_email', 'unknown'\n"
        "- price_query: product search keywords (if applicable, e.g. 'iPhone 15 Pro')\n"
        "- presentation_topic: clear slide topic title (if applicable)\n"
        "- slides_count: number of slides to generate (default to 5)\n"
        "- email_recipient: email address mentioned (if applicable)\n"
        "- email_instruction: what the email is about or custom details to include (if applicable)\n"
        "Be accurate and only output JSON."
    )
    
    try:
        raw_intent = await call_gemini(system_prompt, f"User request: '{text}'", json_mode=True)
        intent_data = json.loads(raw_intent.strip())
        intent = intent_data.get("intent", "unknown")
        steps.append(f"Parsed intent: '{intent}'.")
    except Exception as e:
        steps.append(f"Failed to parse intent: {str(e)}. Defaulting to unknown.")
        intent_data = {}
        
    # Define downstream URLs
    PRICE_URL = os.environ.get("VITE_PRICE_URL", "http://jarvis_price_compare:8002")
    PRESENTATION_URL = os.environ.get("VITE_PRESENTATION_URL", "http://jarvis_presentation:8001")
    EMAIL_URL = os.environ.get("VITE_EMAIL_URL", "http://jarvis_email:8003")
    
    price_results = None
    presentation_results = None
    email_draft_results = None
    
    async with httpx.AsyncClient() as client:
        # 2. Handle Price Compare intent
        if intent in ["price_compare", "price_compare_and_email"]:
            price_query = intent_data.get("price_query") or text
            steps.append(f"Triggering price comparison for: '{price_query}'.")
            try:
                price_resp = await client.post(f"{PRICE_URL}/search", json={"query": price_query}, timeout=20.0)
                if price_resp.status_code == 200:
                    price_results = price_resp.json()
                    response_payload["price_compare"] = price_results
                    steps.append(f"Retrieved {len(price_results.get('results', []))} price search results.")
                else:
                    steps.append(f"Price compare service returned error: {price_resp.text}")
            except Exception as e:
                steps.append(f"Failed to reach price compare service: {str(e)}")
                
        # 3. Handle Presentation intent
        if intent in ["presentation", "presentation_and_email"]:
            presentation_topic = intent_data.get("presentation_topic") or text
            slides_count = intent_data.get("slides_count", 5)
            steps.append(f"Triggering slide generation on topic: '{presentation_topic}' ({slides_count} slides).")
            try:
                pres_resp = await client.post(
                    f"{PRESENTATION_URL}/generate", 
                    json={"topic": presentation_topic, "slides_count": slides_count},
                    timeout=30.0
                )
                if pres_resp.status_code == 200:
                    presentation_results = pres_resp.json()
                    response_payload["presentation"] = presentation_results
                    steps.append(f"Generated presentation '{presentation_results.get('filename')}' successfully.")
                else:
                    steps.append(f"Presentation service returned error: {pres_resp.text}")
            except Exception as e:
                steps.append(f"Failed to reach presentation service: {str(e)}")
                
        # 4. Handle Email components (drafting)
        if intent in ["email_draft", "price_compare_and_email", "presentation_and_email"]:
            recipient = intent_data.get("email_recipient", "")
            instruction = intent_data.get("email_instruction", "Review the generated data.")
            steps.append(f"Drafting email to: '{recipient or 'Unspecified'}'.")
            
            # Compose email body using Gemini
            email_prompt_system = (
                "You are an email assistant. Write a professional, polite, and comprehensive business email body "
                "in HTML format. Highlight search results, prices, slide presentation names, or other details if provided. "
                "Wrap your email content nicely with HTML tags (p, ul, li, strong, etc.) so it displays beautifully. "
                "Do not write full html/head/body documents, just paragraphs and list items. Keep it professional."
            )
            
            email_context = f"Instruction: {instruction}\n"
            if price_results:
                email_context += f"Price Query: {price_results.get('query')}\nPrice Results:\n"
                for r in price_results.get("results", [])[:3]:
                    email_context += f"- {r['title']} from {r['source']}: {r['price']} (Link: {r['link']})\n"
            if presentation_results:
                email_context += f"Presentation Topic: {presentation_results.get('topic')}\nPresentation File: {presentation_results.get('filename')}\n"
                
            try:
                subject = f"JARVIS Report: {intent_data.get('price_query') or intent_data.get('presentation_topic') or 'Automated Update'}"
                email_body = await call_gemini(email_prompt_system, email_context)
                
                draft_resp = await client.post(f"{EMAIL_URL}/draft", json={
                    "recipient": recipient,
                    "subject": subject,
                    "body": email_body
                }, timeout=10.0)
                
                if draft_resp.status_code == 200:
                    email_draft_results = draft_resp.json()
                    response_payload["email_draft"] = email_draft_results
                    steps.append(f"Created email draft (ID: {email_draft_results.get('draft_id')}) successfully.")
                else:
                    steps.append(f"Email service returned error: {draft_resp.text}")
            except Exception as e:
                steps.append(f"Failed to draft email: {str(e)}")
                
        # 5. Handle fallback / Unknown query
        if intent == "unknown" or (not price_results and not presentation_results and not email_draft_results):
            steps.append("Processing general conversation query.")
            try:
                chat_resp = await call_gemini(
                    "You are JARVIS, a highly capable AI assistant. Answer the user's query politely, professionally, and comprehensively.",
                    text
                )
                response_payload["chat_response"] = chat_resp
                steps.append("Generated general conversational response.")
            except Exception as e:
                steps.append(f"Failed to generate conversational response: {str(e)}")
                
    steps.append("Saved audit transaction.")
    
    # 6. Save execution logs
    status = "success" if intent != "unknown" else "conversation"
    write_audit_log(text, intent, status, response_payload)
    
    return {
        "status": status,
        "intent": intent,
        "steps": steps,
        "result": response_payload
    }

