"""Copy every row from one database to another (any SQLAlchemy dialect pair).

Used to move data between SQLite and Postgres in either direction, e.g. bringing
the production Postgres data back down to the local SQLite file:

    SRC_URL="postgresql+psycopg://habits:PW@127.0.0.1:15432/habits" \
    DST_URL="sqlite:////Users/me/Library/Application Support/Habits/mastery.db" \
    python scripts/copy_db.py [--dry-run] [--truncate]

The target schema must already exist at the same Alembic revision as the source
(`alembic upgrade head` against DST_URL first). Only data is copied, table by
table in foreign-key order; `alembic_version` is skipped. Pass --truncate to
empty the target tables first (reverse FK order) so the copy is idempotent.
Postgres targets get their sequences reset afterwards.

Exit status is non-zero if any table's row count differs between source and
target after the copy.
"""

from __future__ import annotations

import json
import os
import sys
from typing import Any

from sqlalchemy import JSON, MetaData, String, Table, Text, create_engine, delete, func, insert, select, text
from sqlalchemy.engine import Connection, Engine

SKIP_TABLES = {"alembic_version"}
CHUNK = 500


def _coerce_row(row: dict[str, Any], table: Table) -> dict[str, Any]:
    """Adapt values for the target column types (JSON vs text mismatches)."""
    out: dict[str, Any] = {}
    for key, value in row.items():
        col = table.columns.get(key)
        if col is None:
            continue  # source column the target doesn't have
        if isinstance(value, (dict, list)) and isinstance(col.type, (String, Text)):
            value = json.dumps(value)
        elif isinstance(value, str) and isinstance(col.type, JSON):
            try:
                value = json.loads(value)
            except ValueError:
                pass
        out[key] = value
    return out


def _alembic_rev(engine: Engine) -> str | None:
    try:
        with engine.connect() as conn:
            return conn.execute(text("select version_num from alembic_version")).scalar()
    except Exception:  # noqa: BLE001 — table may not exist
        return None


def _reset_pg_sequences(conn: Connection, tables: list[Table]) -> None:
    for t in tables:
        pk = [c for c in t.primary_key.columns if c.autoincrement is not False]
        if len(pk) != 1:
            continue
        col = pk[0].name
        seq = conn.execute(text("select pg_get_serial_sequence(:t, :c)"), {"t": t.name, "c": col}).scalar()
        if not seq:
            continue
        conn.execute(
            text(f"select setval('{seq}', coalesce((select max({col}) from {t.name}), 0) + 1, false)")
        )


def main() -> int:
    dry_run = "--dry-run" in sys.argv
    truncate = "--truncate" in sys.argv

    src_url = os.getenv("SRC_URL")
    dst_url = os.getenv("DST_URL")
    if not src_url or not dst_url:
        print("ERROR: set SRC_URL and DST_URL", file=sys.stderr)
        return 2

    src = create_engine(src_url)
    dst = create_engine(dst_url)

    src_rev, dst_rev = _alembic_rev(src), _alembic_rev(dst)
    print(f"source alembic revision: {src_rev}\ntarget alembic revision: {dst_rev}")
    if src_rev != dst_rev:
        print("ERROR: revisions differ — run `alembic upgrade head` against DST_URL first", file=sys.stderr)
        return 2

    src_meta = MetaData()
    src_meta.reflect(bind=src)
    dst_meta = MetaData()
    dst_meta.reflect(bind=dst)

    ordered = [t for t in src_meta.sorted_tables if t.name not in SKIP_TABLES]
    missing = [t.name for t in ordered if t.name not in dst_meta.tables]
    if missing:
        print(f"ERROR: target is missing tables: {', '.join(missing)}", file=sys.stderr)
        return 2
    print(f"tables ({len(ordered)}): {', '.join(t.name for t in ordered)}")

    total = 0
    with src.connect() as sconn, dst.begin() as dconn:
        if dconn.dialect.name == "sqlite":
            dconn.execute(text("PRAGMA foreign_keys = OFF"))

        if truncate:
            for t in reversed(ordered):
                if not dry_run:
                    dconn.execute(delete(dst_meta.tables[t.name]))
            print("target tables emptied" if not dry_run else "(dry run) would empty target tables")

        for t in ordered:
            target = dst_meta.tables[t.name]
            rows = [_coerce_row(dict(r._mapping), target) for r in sconn.execute(select(t))]
            print(f"  {t.name:<24} {len(rows):>6} rows")
            total += len(rows)
            if dry_run or not rows:
                continue
            for i in range(0, len(rows), CHUNK):
                dconn.execute(insert(target), rows[i : i + CHUNK])

        if not dry_run and dconn.dialect.name == "postgresql":
            _reset_pg_sequences(dconn, ordered)

    print(f"{'would copy' if dry_run else 'copied'} {total} rows")
    if dry_run:
        return 0

    # Verify counts.
    mismatched = []
    with src.connect() as sconn, dst.connect() as dconn:
        for t in ordered:
            s = sconn.execute(select(func.count()).select_from(t)).scalar()
            d = dconn.execute(select(func.count()).select_from(dst_meta.tables[t.name])).scalar()
            if s != d:
                mismatched.append((t.name, s, d))
    if mismatched:
        for name, s, d in mismatched:
            print(f"MISMATCH {name}: source={s} target={d}", file=sys.stderr)
        return 1
    print("verified: every table's row count matches")
    return 0


if __name__ == "__main__":
    sys.exit(main())
