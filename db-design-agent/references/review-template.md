# DB Review Template

Use in **REVIEW mode** — auditing schemas, queries, indexes, and migrations.

---

## Severity Definitions

| Severity | Meaning |
|----------|---------|
| `CRITICAL` | Data loss risk, correctness bug, or production-down scenario |
| `MAJOR` | Serious performance problem or integrity risk under load |
| `MINOR` | Sub-optimal design that will cause pain at scale |
| `SUGGESTION` | Improvement with no immediate risk |

---

## Schema Review Checklist

```
SCHEMA AUDIT — {table_name}
═══════════════════════════════════════
TYPES
[ ] No FLOAT for monetary values — DECIMAL or integer cents
[ ] No VARCHAR(255) everywhere — types match actual data
[ ] TIMESTAMPTZ not TIMESTAMP — timezone-aware
[ ] UUIDs or BIGSERIAL PKs — no INT (overflow risk at 2B rows)

CONSTRAINTS
[ ] All NOT NULL columns have DEFAULT or explicit constraint
[ ] CHECK constraints on status/enum columns
[ ] FK constraints defined (not just app-level)
[ ] UNIQUE constraints on business keys (email, slug, etc.)

NORMALISATION
[ ] No repeating groups or comma-separated lists in columns
[ ] No data duplicated across tables without documented justification
[ ] FK relationships correct and complete

NAMING
[ ] snake_case throughout
[ ] FK columns use {table}_id convention
[ ] Boolean columns use is_ or has_ prefix
[ ] Timestamps named created_at, updated_at, deleted_at

AUDIT
[ ] created_at on every table
[ ] updated_at on every table
[ ] Soft delete (deleted_at) if applicable
```

---

## Index Review Checklist

```
INDEX AUDIT — {table_name}
═══════════════════════════════════════
[ ] Every FK column has an index
[ ] Composite indexes have selective column first
[ ] Partial indexes used for filtered queries (WHERE is_active, WHERE deleted_at IS NULL)
[ ] No redundant indexes (A redundant if (A, B) exists)
[ ] No unused indexes (check pg_stat_user_indexes)
[ ] Index count reasonable (< 6 per write-heavy table)
[ ] EXPLAIN ANALYSE run on critical queries
[ ] No Seq Scan on large tables in critical paths
```

---

## Query Review Checklist

```
QUERY AUDIT
═══════════════════════════════════════
[ ] No N+1 — no queries inside loops
[ ] No OFFSET on large datasets — cursor pagination used
[ ] JOINs indexed on both sides
[ ] No SELECT * in production queries
[ ] Aggregations on indexed/partitioned columns
[ ] CTEs used for readability over nested subqueries
[ ] EXPLAIN ANALYSE shows expected plan (Index Scan, not Seq Scan)
```

---

## Migration Review Checklist

```
MIGRATION AUDIT
═══════════════════════════════════════
[ ] DOWN migration written and correct
[ ] NOT NULL column → 3-step process (add nullable, backfill, constrain)
[ ] Column rename → expand/contract across 2 deploys
[ ] Column drop → app updated first (separate deploy)
[ ] Index creation → CONCURRENTLY used
[ ] FK addition → NOT VALID + VALIDATE CONSTRAINT used
[ ] Large data backfill → batched, not single UPDATE
[ ] Tested on production-size dataset
[ ] Rollback plan documented
```

---

## Full Review Report

```
═══════════════════════════════════════════════
DATABASE REVIEW REPORT
═══════════════════════════════════════════════
Scope            : ____________________
DB Engine        : PostgreSQL / MySQL / MongoDB / other
ORM              : Prisma / SQLAlchemy / GORM / raw SQL / other
Reviewed by      : DB Design Agent
───────────────────────────────────────────────

SUMMARY
───────
Overall health  : HEALTHY / NEEDS WORK / CRITICAL
Schema issues   : X found
Index issues    : X found
Query issues    : X found
Migration risks : X found

───────────────────────────────────────────────
FINDINGS
───────────────────────────────────────────────

[DB-001] <CRITICAL/MAJOR/MINOR/SUGGESTION>
Area      : SCHEMA / INDEX / QUERY / MIGRATION
Location  : <table name, column, or query>
Issue     : <clear description of the problem>
Risk      : <what goes wrong at scale or in production>
Fix       : <specific actionable fix with SQL example>

───────────────────────────────────────────────
VERDICT
───────────────────────────────────────────────
[ ] APPROVE     — clean design
[ ] APPROVE*    — minor issues; safe to ship
[ ] CHANGES     — MAJOR issues; fix before production
[ ] BLOCK       — CRITICAL issues; data loss or downtime risk
═══════════════════════════════════════════════
```

---

## Example Review

```
═══════════════════════════════════════════════
DATABASE REVIEW REPORT
═══════════════════════════════════════════════
Scope    : order management schema
DB Engine: PostgreSQL 15
ORM      : Prisma
───────────────────────────────────────────────

SUMMARY
───────
Overall health  : NEEDS WORK
Schema issues   : 3 found
Index issues    : 2 found
Query issues    : 1 found
Migration risks : 1 found

───────────────────────────────────────────────
FINDINGS
───────────────────────────────────────────────

[DB-001] CRITICAL
Area     : SCHEMA
Location : order.total (FLOAT type)
Issue    : Monetary value stored as FLOAT. Floating point
           arithmetic introduces rounding errors.
           e.g. 0.1 + 0.2 = 0.30000000000000004
Risk     : Financial calculations will be incorrect.
           Tax and discount calculations compound the error.
Fix      : ALTER TABLE order ALTER COLUMN total TYPE DECIMAL(19,4);
           Or store as BIGINT (cents): total_cents BIGINT NOT NULL

[DB-002] MAJOR
Area     : INDEX
Location : order_item.order_id (missing index)
Issue    : order_id is a FK column with no index.
           JOIN order JOIN order_item performs full table scan.
Risk     : At 1M order_items, this query takes seconds.
Fix      : CREATE INDEX CONCURRENTLY idx_order_item_order_id
           ON order_item(order_id);

[DB-003] MAJOR
Area     : SCHEMA
Location : order.status (VARCHAR, no CHECK constraint)
Issue    : status accepts any string. No enforcement of valid values.
           Application bug could insert 'Pending' vs 'pending'.
Risk     : Data inconsistency; queries filtering on status return wrong results.
Fix      : ALTER TABLE order ADD CONSTRAINT chk_order_status
           CHECK (status IN ('pending','processing','fulfilled','cancelled'));

[DB-004] MINOR
Area     : SCHEMA
Location : All tables
Issue    : No updated_at column on any table.
           Cannot determine when a record was last modified.
Fix      : ALTER TABLE order ADD COLUMN updated_at TIMESTAMPTZ
           NOT NULL DEFAULT NOW();
           Add trigger to auto-update. Repeat for all tables.

[DB-005] MINOR
Area     : QUERY
Location : GET /api/orders endpoint
Issue    : Uses OFFSET 0, 20, 40... for pagination.
           At page 500+ (OFFSET 10000), query becomes slow.
Risk     : Admin list views will time out at scale.
Fix      : Implement cursor-based pagination using
           (created_at, id) tuple as cursor.

[DB-006] SUGGESTION
Area     : MIGRATION
Location : migration_003_add_phone_to_user.sql
Issue    : Adds phone VARCHAR(20) NOT NULL in one step.
           On a table with existing rows, this will fail
           unless a DEFAULT is provided.
Risk     : Migration will fail in production; requires rollback.
Fix      : 3-step process:
           Step 1: ADD COLUMN phone VARCHAR(20) (nullable)
           Step 2: UPDATE users SET phone = '' WHERE phone IS NULL
           Step 3: ALTER COLUMN phone SET NOT NULL

───────────────────────────────────────────────
VERDICT
───────────────────────────────────────────────
[ ] APPROVE
[ ] APPROVE*
[x] CHANGES  — DB-001 (float money) is a correctness bug; DB-002 will cause
               production slowdown; DB-006 will fail migration
[ ] BLOCK
═══════════════════════════════════════════════
```
