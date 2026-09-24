# JanSetu — AI Civic Intelligence for India

One-line description: JanSetu converts multilingual citizen voice/text into
structured civic demand, fuses it with demographic, infrastructure, and
investment data, and gives policymakers hotspot maps, evidence-backed
recommendations, and investment scenario estimates.

*Built for "Build with AI: Code for Communities — 2nd Edition" (Google Cloud).*

## Problem
Governments across India struggle to consolidate citizen development requests
and align them with infrastructure priorities. Requests arrive fragmented across
languages, channels, and locations, so real demand stays invisible.

## Solution
Citizen voice/text → Google AI understanding → structured civic signal →
deterministic data fusion → demand hotspots → evidence-backed recommendations →
investment simulator → policymaker dashboard. One pipeline, end to end.

## Core Features
- Citizen reporting in Hindi/English (+4 more languages) via text or voice
- Gemini structured extraction (Pydantic-validated, location from metadata)
- Civic Pulse: 30-day vs prior-30-day demand trends, rising/stable/declining
- Geographic hotspots with deterministic priority scores + exposed factors
- Evidence panels, development recommendations, plain-English policy query
- Investment simulator: district scenarios + 3-budget comparison, always labelled estimates

## Architecture
See `docs/architecture.md` (with Mermaid diagram). Iron rule: **Gemini extracts
and explains; Python computes.** No LLM numerics, no LLM SQL, no LLM code exec.

## Google AI Integration
- **Gemini** (`gemini-1.5-flash`): civic-issue classification → structured JSON;
  evidence-grounded explanations (validated JSON, template fallback).
- **Speech-to-Text**: voice transcripts (graceful 501 without credentials).
- Key server-side only; malformed output falls back deterministically; all
  scores/counts/projections are Python-computed and traceable.

## Tech Stack
Next.js 16 + TypeScript + Tailwind + shadcn/ui · FastAPI + Pydantic + SQLAlchemy
· SQLite (local) / PostgreSQL (prod) · Google Maps w/ SVG fallback · Cloud Run.

## Data
Three tiers, never confused (see `docs/data-sources.md`):
- **Observed data**: rows citizens actually submit (`source_type` future; API marks
  aggregates `data_source: synthetic_demo` while seeded).
- **Synthetic demo data**: 10,500 seeded signals, 24 districts, 6 states, 90-day
  spread, `seed=42` reproducible. NOT government data. Clearly labelled in UI/API/docs.
- **Prototype estimates**: simulator outputs, always labelled "Scenario estimate".

## Demo
`docs/demo-script.md` (3–5 min) · `docs/demo-checklist.md` · `docs/demo.md`.
Seeded hotspots/trends are predictable; all data still flows through the real pipeline.

## Local Development
```bash
cp .env.example .env
cd backend && pip install -r requirements.txt
python -m app.services.seed_run --n 10500
uvicorn app.main:app --reload   # :8000, /docs
pytest                          # 48 tests
cd ../frontend && npm install && npm run dev  # :3000
```

## Environment Variables
`.env.example`: `DATABASE_URL`, `GEMINI_API_KEY`, `GEMINI_MODEL`,
`GOOGLE_CLOUD_PROJECT`, `GOOGLE_APPLICATION_CREDENTIALS`, `GCS_BUCKET`,
`GOOGLE_MAPS_API_KEY`, `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`.
Only `NEXT_PUBLIC_*` reach the browser (API URL + Maps key by design).

## Testing
`pytest` (48: ingestion, Gemini validation incl. malformed, voice, pulse,
hotspots, recommendations, simulator monotonicity/rejections, NL query,
rate limiter, empty-DB) · `npm run lint` · `next build` (typecheck included).

## Deployment
`cloudbuild.yaml` → Cloud Run (asia-south1): backend :8000, frontend :3000,
`DATABASE_URL`, `GEMINI_API_KEY`, `CORS_ORIGINS`, Speech/GCS wiring.
`GET /api/v1/health` reports status + database + AI/voice flags (no secrets).

## Security
Env-only secrets · CORS allowlist (prod origin via `CORS_ORIGINS`) · Pydantic
validation everywhere · 10 MB audio cap + MIME allowlist · 120/min citizen
rate limit · request IDs + timing logs (no bodies/keys) · generic 500 envelope ·
Gemini key server-side · no LLM SQL/code.

## Scalability
Stateless API + indexed columns (state/district/category/created_at) +
server-side aggregation (≤50 hotspots/response, never 10k markers) +
CDN-cacheable static frontend → Cloud SQL + BigQuery offload path.

## India-wide Expansion
District-agnostic aggregation/scoring/UI; locations from request metadata;
add districts to seed/config to scale state by state.

## Cross-border Architecture
Categories, weights, per-person costs, and language lists are config, not code —
adaptable per region/BRICS country with the same pipeline.

## Limitations
- No live Gemini/STT without keys (fallbacks keep the demo working).
- Seed data is synthetic; simulator is a planning toy, not a forecast.
- In-memory rate limiter (use Redis in prod); SQLite locally (Postgres in prod).
- No auth layer yet; single-tenant prototype assumptions.

## Team
Hackathon prototype built with AI assistance for community impact. No government
partnership is claimed; no adoption numbers are claimed.
