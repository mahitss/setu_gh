# Data model
citizen_signals(id, raw_text, language, category, sub_category, severity, summary,
state, district, locality, latitude, longitude, ai_confidence, created_at).
infrastructure(state, district, category, facility_count, coverage_index, gap_index).
demographics(state, district, population, population_density, growth_rate).
investments(state, district, category, amount INR, status, year).
recommendations(state, district, category, evidence JSON, recommendation, population_affected, confidence, created_at).
All seed data synthetic (seed=42), BigQuery-ready flat tables.
