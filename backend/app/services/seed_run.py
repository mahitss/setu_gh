"""Seed runner: python -m app.services.seed_run [--n 10500]"""
import argparse
from ..database import SessionLocal, init_db
from .seed import seed

if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--n", type=int, default=10500)
    a = p.parse_args()
    init_db()
    db = SessionLocal()
    print(seed(db, n_signals=a.n))
