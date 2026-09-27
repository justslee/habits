"""Import a meal plan (JSON on stdin) as the current cycle. See app/services/plan_import.py.

    DATABASE_URL=... python scripts/import_plan.py [--dry-run] [--replace] < plan.json

--dry-run prints the layout and changes nothing. --replace closes an open cycle first.
"""

from __future__ import annotations

import argparse
import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.db.database import SessionLocal  # noqa: E402
from app.models.user import User  # noqa: E402
from app.services import plan_import  # noqa: E402


def main() -> int:
    p = argparse.ArgumentParser(prog="import_plan")
    p.add_argument("--dry-run", action="store_true")
    p.add_argument("--replace", action="store_true")
    args = p.parse_args()
    spec = plan_import.PlanSpec.model_validate(json.load(sys.stdin))
    db = SessionLocal()
    try:
        user = db.query(User).first()
        if args.dry_run:
            spans = plan_import._dinner_dates(db, user.id, spec.start_date, spec.meals)
            for meal, span in zip(spec.meals, spans):
                spare = meal.dinners - len(span)
                print(
                    f"{span[0]:%a %b %d}–{span[-1]:%a %b %d}  {meal.title}"
                    f"  ({meal.dinners} dinners{f', {spare} spare' if spare else ''})"
                )
            return 0
        try:
            cycle = plan_import.import_plan(db, user.id, spec, replace=args.replace)
        except plan_import.PlanConflict as e:
            print(e, file=sys.stderr)
            return 2
        print(
            json.dumps(
                {
                    "cycle_id": cycle.id,
                    "status": cycle.status,
                    "start": cycle.start_date.isoformat(),
                    "end": cycle.end_date.isoformat(),
                    "meals": [
                        [
                            m.recipe.title,
                            m.days_covered[0],
                            m.days_covered[-1],
                            m.servings,
                        ]
                        for m in cycle.meals
                    ],
                },
                indent=2,
            )
        )
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    sys.exit(main())
