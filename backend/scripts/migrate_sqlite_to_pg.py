"""One-off data migration: copy every row from the local SQLite DB into Postgres.

The target schema must already exist (run `alembic upgrade head` against the
Postgres DATABASE_URL first). This copies data only — table-by-table in FK
dependency order — then fixes Postgres sequences so future inserts don't collide.

Usage:
    SQLITE_URL="sqlite:////path/to/data/mastery.db" \
    DATABASE_URL="postgresql+psycopg://habits:...@localhost:5432/habits" \
    python scripts/migrate_sqlite_to_pg.py [--dry-run]

Idempotency: this INSERTs, so run it once into a freshly-migrated (empty) target.
"""

from __future__ import annotations

import os
import sys

from sqlalchemy import MetaData, create_engine, insert, select, text

SKIP_TABLES = {"alembic_version"}


def main() -> int:
    dry_run = "--dry-run" in sys.argv

    sqlite_url = os.getenv("SQLITE_URL")
    target_url = os.getenv("DATABASE_URL")
    if not sqlite_url or not target_url:
        print("ERROR: set SQLITE_URL and DATABASE_URL", file=sys.stderr)
        return 2
    if not target_url.startswith("postgresql"):
        print(f"ERROR: DATABASE_URL is not Postgres: {target_url}", file=sys.stderr)
        return 2

    src = create_engine(sqlite_url)
    dst = create_engine(target_url)

    # Reflect the source schema; use the target's copy of each table for inserts.
    src_meta = MetaData()
    src_meta.reflect(bind=src)
    dst_meta = MetaData()
    dst_meta.reflect(bind=dst)

    ordered = [t for t in src_meta.sorted_tables if t.name not in SKIP_TABLES]
    print(f"Tables to copy ({len(ordered)}): {', '.join(t.name for t in ordered)}")

    total = 0
    with src.connect() as sconn, dst.begin() as dconn:
        for tbl in ordered:
            if tbl.name not in dst_meta.tables:
                print(f"  ! {tbl.name}: not present in target, skipping")
                continue
            dst_tbl = dst_meta.tables[tbl.name]
            rows = [dict(r._mapping) for r in sconn.execute(select(tbl))]
            if not rows:
                print(f"  · {tbl.name}: 0 rows")
                continue
            # Only carry columns that exist in the target table.
            dst_cols = set(dst_tbl.c.keys())
            rows = [{k: v for k, v in row.items() if k in dst_cols} for row in rows]
            print(f"  → {tbl.name}: {len(rows)} rows")
            total += len(rows)
            if not dry_run:
                dconn.execute(insert(dst_tbl), rows)

        if not dry_run:
            # Fix sequences for integer PKs so future inserts continue past copied ids.
            for tbl in ordered:
                if tbl.name not in dst_meta.tables:
                    continue
                dst_tbl = dst_meta.tables[tbl.name]
                pk_cols = [c for c in dst_tbl.primary_key.columns]
                if len(pk_cols) != 1:
                    continue
                pk = pk_cols[0].name
                dconn.execute(text(
                    f"SELECT setval(pg_get_serial_sequence('{tbl.name}', '{pk}'), "
                    f"COALESCE((SELECT MAX({pk}) FROM {tbl.name}), 1), true)"
                ))

    print(f"{'DRY-RUN: would copy' if dry_run else 'Copied'} {total} rows total.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
