# JanSetu demo mode

All data is synthetic demo data.

## 1. Startup commands
```powershell
cd backend; python -m uvicorn app.main:app --reload   # :8000
cd frontend; npm install; npm run dev                  # :3000
```

## 2. Environment variables
Copy `.env.example` to `.env`. Demo runs with everything blank (fallbacks).
For live AI: `GEMINI_API_KEY`. For live voice: `GOOGLE_APPLICATION_CREDENTIALS`.
Never commit `.env`.

## 3. Seed/reset command
```powershell
cd backend; python -m app.services.seed_run --n 10500
```
Resets to exactly: 10,500 signals · 24 districts · 6 states · 90-day span ·
`seed=42`. Old rows are cleared first — no duplication. App startup never
re-seeds (`init_db` only creates tables).

## 4. Demo account requirements
None. No login, no accounts.

## 5. Demo scenario (deterministic, real pipeline)
Hindi concern → healthcare/high/Hindi → CivicPulse → Lucknow healthcare
hotspot → evidence → recommendation → ₹100 Cr → ₹250 Cr simulation →
Ask JanSetu. Every step hits live APIs; nothing is pre-recorded.

## 6. Fallback behavior
- No `GEMINI_API_KEY` → rule-based extraction, UI shows "Demo fallback".
- No Speech credentials → voice returns 501 with guidance; text unaffected.
- No Maps key → SVG fallback map (never crashes).
- Backend down → human-readable error states, no blank screens.
- Empty data → zero/empty states everywhere.

## 7. Known limitations
- Simulator outputs are hypothetical estimates, not projections.
- Recommendations are decision-support, not government decisions.
- Aggregation endpoints take ~1.5–2s on SQLite.
- In-memory rate limiter; no auth layer.

## 8. Exact 3-minute flow
00:00 Homepage (How JanSetu works) → 00:20 `/citizen` → 00:35 Hindi concern →
01:00 structured understanding → 01:15 `/dashboard` → 01:35 CivicPulse →
01:50 hotspot → 02:05 evidence + recommendation → 02:25 `/simulate` →
02:45 Ask JanSetu → 03:00 value statement (deterministic math, honest AI).
