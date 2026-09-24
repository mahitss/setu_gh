# API
GET /api/v1/health — liveness.
POST /api/v1/citizen/signals {text, language="auto", state?, district?, locality?, latitude?, longitude?} — ingest. Returns {success, signal}.
Allowed categories: healthcare, education, roads, water, sanitation, electricity, public_transport, digital_infrastructure, housing, environment, other.
POST /api/v1/citizen/voice (multipart audio + language_code) — STT transcript; 501 if unconfigured.
GET /api/v1/policy-query?category&min_gap&min_signals&max_investment_cr — allowlisted filters, no raw SQL.
GET /api/v1/dashboard/summary — KPIs + top hotspots.
GET /api/v1/hotspots — ranked deterministic hotspots with factors.
GET /api/v1/hotspots/{state}/{district}/{category} — evidence + recommendation.
GET /api/v1/civic-pulse — 30d vs prior growth per category.
GET /api/v1/recommendations — top 10.
POST /api/v1/simulate {sector, budget_cr} — deterministic estimates.
