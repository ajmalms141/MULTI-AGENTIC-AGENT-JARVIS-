from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="Jarvis Email Service")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

import os
import uuid
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from fastapi import HTTPException

# In-memory database of drafts
drafts_db = {}

@app.get("/health")
def health():
    return {"status": "ok", "service": "email_service"}

@app.post("/draft")
async def create_draft(body: dict):
    draft_id = str(uuid.uuid4())
    recipient = body.get("recipient", "")
    subject = body.get("subject", "")
    content = body.get("body", "")
    
    drafts_db[draft_id] = {
        "draft_id": draft_id,
        "recipient": recipient,
        "subject": subject,
        "body": content
    }
    return {
        "status": "success",
        "draft_id": draft_id,
        "recipient": recipient,
        "subject": subject,
        "body": content
    }

@app.get("/drafts/{draft_id}")
async def get_draft(draft_id: str):
    if draft_id not in drafts_db:
        raise HTTPException(status_code=404, detail="Draft not found")
    return drafts_db[draft_id]

@app.put("/drafts/{draft_id}")
async def update_draft(draft_id: str, body: dict):
    if draft_id not in drafts_db:
        raise HTTPException(status_code=404, detail="Draft not found")
    drafts_db[draft_id]["recipient"] = body.get("recipient", drafts_db[draft_id]["recipient"])
    drafts_db[draft_id]["subject"] = body.get("subject", drafts_db[draft_id]["subject"])
    drafts_db[draft_id]["body"] = body.get("body", drafts_db[draft_id]["body"])
    return {"status": "success", "draft": drafts_db[draft_id]}

@app.post("/send")
async def send_email(body: dict):
    recipient = body.get("recipient", "")
    subject = body.get("subject", "")
    content = body.get("body", "")
    
    if not recipient:
        raise HTTPException(status_code=400, detail="Recipient is required")
        
    gmail_user = os.environ.get("GMAIL_USER")
    gmail_password = os.environ.get("GMAIL_APP_PASSWORD")
    
    if not gmail_user or not gmail_password:
        raise HTTPException(status_code=500, detail="Gmail SMTP credentials are not configured on server")
        
    try:
        msg = MIMEMultipart()
        msg['From'] = gmail_user
        msg['To'] = recipient
        msg['Subject'] = subject
        
        # Support basic formatting or plain text
        msg.attach(MIMEText(content, 'html' if '<html>' in content or '<p>' in content else 'plain'))
        
        server = smtplib.SMTP('smtp.gmail.com', 587)
        server.starttls()
        server.login(gmail_user, gmail_password)
        server.sendmail(gmail_user, recipient, msg.as_string())
        server.quit()
        
        # If sending was triggered from a saved draft, clean it up
        draft_id = body.get("draft_id")
        if draft_id and draft_id in drafts_db:
            del drafts_db[draft_id]
            
        return {"status": "success", "message": f"Email successfully sent to {recipient}"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to send email: {str(e)}")

