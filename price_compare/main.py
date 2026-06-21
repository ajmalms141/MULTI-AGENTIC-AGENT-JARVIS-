from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="Jarvis Price Compare Service")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
def health():
    return {"status": "ok", "service": "price_compare"}

@app.post("/search")
async def search(body: dict):
    return {"status": "stub", "query": body.get("query", ""), "results": []}
