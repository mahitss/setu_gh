# JanSetu — AI Civic Intelligence for India

**Build with AI: Code for Communities — 2nd Edition (Google Cloud hackathon)**

## Problem
Governments across India struggle to consolidate citizen development requests and
align them with infrastructure priorities. Requests are fragmented across
languages, channels, and locations.

## Solution
JanSetu turns citizen voice/text into structured civic signals (Gemini), aggregates
them with demographic, infrastructure, and investment data (deterministic Python
engine), and serves demand hotspots, evidence-backed recommendations, and an
investment simulator on a policymaker dashboard.

Citizen voice/text → AI understanding → structured signal → hotspot detection →
evidence-backed recommendations → dashboard.

## Architecture
See `docs/architecture.md`. Key rule: **Gemini extracts and explains; Python
computes.** All scores, counts, and projections are deterministic and traceable;
the LLM never produces authoritative numbers.

## Tech stack
- Frontend: Next.js 16, TypeScript, App Router, Tailwind CSS
- Backend: Python, FastAPI, Pydantic, SQLAlchemy
- AI: Gemini (`gemini-1.5-flash` default) via `google-generativeai`
- Voice: Google Cloud Speech-to-Text (`google-cloud-speech`)
- Data: SQLite (local) / PostgreSQL (prod via `DATABASE_URL`), BigQuery-ready flat tables
- Maps: Google Maps Platform with SVG fallback (works without a key)
- Deploy: Docker + Google Cloud Run (`cloudbuild.yaml`)

## Google AI usage
- Multilingual civic-issue classification → structured `CivicSignal` JSON
  (`backend/app/services/gemini.py`, strict system prompt, Pydantic-validated)
- Natural-language explanations of deterministic evidence (recommendation text)
- Speech-to-Text for voice submissions
- Gemini never computes scores, populations, or investment math

## Data sources
Prototype runs on **synthetic demo data** (`backend/app/services/seed.py`,
`seed=42`): 10,500 citizen signals across 24 districts in 6 states, plus
demographics, infrastructure, and investments.

> **Synthetic data disclaimer:** seed data is NOT government data and is never
> presented as such. The UI labels it demo data. The schema is designed so real
> public datasets (Census, NHM/HMIS, state portals) can replace the seed without
> code changes.

## Local setup
```bash
cp .env.example .env          # add GEMINI_API_KEY for live extraction (optional)
cd backend
pip install -r requirements.txt
python -m app.services.seed_run --n 10500
uvicorn app.main:app --reload # http://localhost:8000/docs
pytest                        # 30 tests
cd ../frontend
npm install; npm run dev      # http://localhost:3000
```

## Environment variables
See `.env.example`: `DATABASE_URL`, `GEMINI_API_KEY`, `GEMINI_MODEL`,
`GOOGLE_CLOUD_PROJECT`, `GOOGLE_MAPS_API_KEY`, `NEXT_PUBLIC_API_URL`,
`NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`. Never commit `.env`.

## Deployment
```bash
gcloud builds submit --config cloudbuild.yaml \
  --substitutions _GEMINI_API_KEY=$GEMINI_API_KEY,_DATABASE_URL=$DATABASE_URL,_API_URL=$API_URL
```
Backend and frontend deploy as separate Cloud Run services (region `asia-south1`).
For voice in prod, attach a service account with Speech-to-Text rights
(`GOOGLE_APPLICATION_CREDENTIALS`).

## API documentation
See `docs/api.md` and `/docs` (Swagger) when the backend runs.

## Scoring methodology
`backend/app/services/engine.py`:
`priority = 0.30·demand + 0.25·infra_gap + 0.20·pop + 0.15·invest_gap + 0.10·trend`.
Every factor is exposed in API responses and the hotspot detail UI. The simulator
divides budget by documented per-person cost assumptions and is always labelled
an estimate.

## Security considerations
Env-only secrets, CORS allowlist, Pydantic validation on every input, Gemini key
server-side only, no LLM-generated SQL/code (allowlisted `policy-query` filters),
10 MB audio cap, no stack traces or keys in client responses, structured logging.

## Scalability
Stateless FastAPI + Postgres/Cloud SQL; flat signal tables partition by
state/district for BigQuery offload; seed script scales to any district list.
Frontend is static + client-fetch, CDN-cacheable.

## India-wide expansion
Add districts to `seed.py`/ingestion config — aggregation, scoring, and UI are
district-agnostic. State/district come from request metadata, never hallucinated.

## BRICS / cross-border adaptability
Categories, scoring weights, and cost assumptions are config, not code. New
regions need only a district list, language hints, and localized per-person costs;
the pipeline (extract → validate → aggregate → explain) is country-neutral.
