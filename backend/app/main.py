from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .config import settings
from .database import init_db
from .routers import health, signals, analytics, voice

app = FastAPI(title="JanSetu API", version="0.1.0")


@app.on_event("startup")
def _startup():
    init_db()


app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.cors_origins.split(",")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router, prefix="/api/v1", tags=["health"])
app.include_router(signals.router, prefix="/api/v1", tags=["citizen"])
app.include_router(voice.router, prefix="/api/v1", tags=["citizen"])
app.include_router(analytics.router, prefix="/api/v1", tags=["analytics"])


@app.get("/")
def root():
    return {"service": "jansetu", "docs": "/docs", "health": "/api/v1/health"}
