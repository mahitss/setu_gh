import logging
import time
import uuid
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from .config import settings
from .database import init_db
from .routers import health, signals, analytics, voice
from .services.rate_limit import FixedWindowLimiter

log = logging.getLogger("jansetu.api")
app = FastAPI(title="JanSetu API", version="0.1.0")

# Prototype-grade: 120 citizen writes/min per client IP. Use Redis in prod.
citizen_limiter = FixedWindowLimiter(max_requests=120, window_seconds=60)


@app.on_event("startup")
def _startup():
    init_db()


@app.middleware("http")
async def request_context(request: Request, call_next):
    request_id = request.headers.get("X-Request-ID", uuid.uuid4().hex[:12])
    start = time.time()
    if request.url.path.startswith("/api/v1/citizen/") and request.method == "POST":
        client_ip = request.client.host if request.client else "unknown"
        if not citizen_limiter.allowed(client_ip):
            return JSONResponse(status_code=429, headers={"X-Request-ID": request_id},
                                content={"success": False, "error": {
                                    "code": "RATE_LIMITED",
                                    "message": "Too many requests. Please wait a minute and try again."}})
    try:
        response = await call_next(request)
    except Exception:
        log.exception("unhandled error")
        return JSONResponse(status_code=500, headers={"X-Request-ID": request_id},
                            content={"success": False, "error": {
                                "code": "INTERNAL_ERROR",
                                "message": "Something went wrong. Please try again."}})
    elapsed_ms = int((time.time() - start) * 1000)
    # Safe access log: method/path/status/timing only — never bodies or keys.
    log.info("rid=%s %s %s -> %s (%sms)", request_id, request.method,
             request.url.path, response.status_code, elapsed_ms)
    response.headers["X-Request-ID"] = request_id
    return response


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
