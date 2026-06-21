from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="Jarvis Email Service")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
def health():
    return {"status": "ok", "service": "email_service"}

@app.post("/draft")
async def draft(body: dict):
    return {"status": "stub", "preview": "Email draft will appear here", "draft_id": "stub_001"}

@app.post("/send")
async def send(body: dict):
    return {"status": "stub", "message": "Email send not yet implemented"}
