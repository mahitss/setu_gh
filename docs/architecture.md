# Architecture
Raw citizen input → Gemini (structured extraction + explanations only) →
FastAPI + SQLite/Postgres → deterministic Python engine (aggregates, scores, simulator) →
Next.js policymaker UI. Maps via Google Maps with fallback. Deploy: Cloud Run.
