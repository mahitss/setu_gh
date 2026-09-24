# Data sources

No public/real government datasets are integrated in this prototype. Nothing
below is fabricated as integrated — the system runs on synthetic demo data,
with an ingestion-ready schema for real datasets.

## Current: synthetic demo (`data_source: synthetic_demo`)
- Generator: `backend/app/services/seed.py` (`seed=42`, reproducible).
- 10,500 citizen signals · 24 districts · 6 states · 6 categories ·
  ~90-day timestamp spread (supports 30d vs 30–60d trends).
- Demographics / infrastructure / investments per district × category.
- Labelled in UI ("Synthetic demo data"), API responses, README, and demo script.

## User-submitted (observed) data
- Citizen text/voice reports stored verbatim (`raw_text`) with detected language,
  structured extraction, and timestamps. The only "real" data in the system.

## Prototype estimates
- Simulator outputs. Always labelled "Scenario estimate — not a guaranteed
  outcome / not an official government projection".

## Candidate public datasets for future ingestion (not yet integrated)
Same schema, no code changes needed to swap them in:
- **Census of India** (Office of the Registrar General) — district population,
  density. censusindia.gov.in.
- **NHM–HMIS** (Ministry of Health & Family Welfare) — facility/service data. hm is.nhm.gov.in.
- **Jal Jeevan Mission dashboard** (Dept. of Drinking Water & Sanitation) —
  tap-water coverage. ejalshakti.gov.in.
- **UDISE+** (Dept. of School Education) — school/teacher counts. udiseplus.gov.in.
- **State open-data portals / data.gov.in** — investments and schemes.

License/terms must be checked per dataset at integration time.
