from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="Jarvis Presentation Service")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
def health():
    return {"status": "ok", "service": "presentation"}

@app.post("/generate")
async def generate(body: dict):
    return {"status": "stub", "topic": body.get("topic", ""), "pptx_path": None}
