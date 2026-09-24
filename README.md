# JanSetu — AI Civic Intelligence for India

**Build with AI: Code for Communities — 2nd Edition (Google Cloud hackathon)**

Citizen voice/text → Gemini structured signal → deterministic Python engine →
hotspots, evidence-backed recommendations, simulator → policymaker dashboard.

> **Synthetic data disclaimer:** all seed data in `backend/app/services/seed.py`
> is clearly synthetic DEMO data (reproducible, `seed=42`). NOT government data.
> Designed so real public datasets can replace it (same schema, BigQuery-ready flat tables).

## Monorepo
- `frontend/` — Next.js + TS + App Router + Tailwind (citizen + dashboard)
- `backend/` — FastAPI + Pydantic + SQLAlchemy (SQLite local, Postgres via `DATABASE_URL`)
- `docs/` — architecture, data-model, api

## Quickstart
```bash
cp .env.example .env
cd backend; pip install -r requirements.txt
python -m app.services.seed_run --n 10500
uvicorn app.main:app --reload
# http://localhost:8000/docs
pytest
```

## Scoring methodology
See `backend/app/services/engine.py`. `priority = 0.30*demand + 0.25*infra_gap +
0.20*pop + 0.15*invest_gap + 0.10*trend`, all factors exposed in API/UI.
LLM explains only; never computes numbers.

## Security
Env vars, no keys committed, CORS allowlist, Pydantic validation,
Gemini key server-side only, no LLM SQL/code exec (allowlisted filters only).
