# JanSetu demo script (5 minutes)

All data is synthetic demo data.

## 1. Citizen report (1 min)
Open `/citizen`. Paste:
`हमारे गांव में अस्पताल बहुत दूर है और एम्बुलेंस आने में बहुत समय लगता है।`
State: Uttar Pradesh, District: Lucknow, Locality: Demo Village → Submit.
Show the understood card: Healthcare / High / Hindi.
Optional: record a voice note instead of typing (needs Speech-to-Text credentials;
otherwise the UI explains typing is required).

## 2. Dashboard (2 min)
Open `/dashboard`. Point out KPIs, the hotspot map (fallback works without a
Maps key), filters (backend-driven), and Civic Pulse trends (30d vs prior 30d).
Ask: "Which districts have high healthcare demand but low existing investment?"
Show the matching districts.

## 3. Evidence (1 min)
Click a hotspot → `/hotspots/[id]`. Walk through evidence, score factors, the
"Why this area is flagged" checklist, and the recommendation. Stress: scores are
deterministic; the AI only explains.

## 4. Simulator (1 min)
Open `/simulate`. Sector Healthcare, ₹100 Cr → projected reach. Switch to ₹500 Cr.
Stress the estimate disclaimer.

## Talking points
- Gemini extracts/explains; Python computes every number.
- Same pipeline scales to any district list (India-wide, then BRICS).
- Seed data is synthetic; real datasets plug into the same schema.
