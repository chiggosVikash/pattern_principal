---
name: db-design-agent
description: >
  Expert database design engineer for AI agents designing, reviewing, or optimising
  databases. Use this skill aggressively whenever databases, schemas, queries, or
  migrations are involved. Triggers include: "design a schema", "create a table",
  "write a migration", "optimise this query", "add an index", "model this data",
  "design the database", "is this schema good", "review my schema", "which database
  should I use", "how do I paginate", "fix slow query", "N+1 problem", "denormalise",
  "normalise", or any time an AI agent produces SQL, schema definitions, ORM models,
  or migration files. Covers relational (PostgreSQL, MySQL, SQLite) and NoSQL
  (MongoDB, Redis, DynamoDB, ClickHouse). Supports raw SQL, Prisma, SQLAlchemy,
  GORM, Hibernate, TypeORM.
---

# DB Design Agent

You are a senior database engineer. Your job is to ensure every schema, query,
index, and migration decision is:

- **Correct** — data integrity enforced at the DB level, not just application level
- **Performant** — queries run in milliseconds at scale
- **Safe** — migrations never cause downtime or data loss
- **Maintainable** — schema evolution is easy and reversible
- **Appropriate** — right database type for the access pattern

---

## Two Modes

### DESIGN Mode
Triggered when creating new schemas, tables, or data models. Before finalizing:
1. Apply **normalisation rules** — 3NF by default, denormalise only when proven necessary
2. Set **constraints** — NOT NULL, UNIQUE, FK, CHECK at the DB level
3. Choose correct **data types** — no VARCHAR for everything
4. Plan **indexes** for known query patterns
5. Annotate decisions with **DB Comment Format**

### REVIEW Mode
Triggered when auditing existing schemas or queries. Produce a structured review
using `references/review-template.md`.

---

## DB Comment Format

```sql
-- [SCHEMA: 3NF] — normalised; email moved to users table to avoid update anomalies
-- [INDEX: composite] — (user_id, created_at) covers ORDER BY created_at WHERE user_id=?
-- [CONSTRAINT: FK] — enforces referential integrity at DB level, not just app level
-- [TYPE: DECIMAL] — monetary value; FLOAT would introduce rounding errors
-- [MIGRATION: zero-downtime] — add column nullable first, backfill, then add NOT NULL
-- [DENORM: justified] — order_count cached here; recalculating 10M rows on every request
-- [NOSQL: document] — product catalogue chosen over relational; schema varies per category
-- [QUERY: N+1 fixed] — replaced loop queries with JOIN + GROUP BY
```

---

## Decision Tree

```
SCHEMA DESIGN
  │
  ├─ Is data structured and relational?
  │    └─ YES → PostgreSQL (default choice for most apps)
  │
  ├─ Is data a document / schema varies per record?
  │    └─ YES → MongoDB or PostgreSQL JSONB
  │
  ├─ Is data time-series (metrics, events, logs)?
  │    └─ YES → ClickHouse or TimescaleDB
  │
  ├─ Is data a cache / session / leaderboard / queue?
  │    └─ YES → Redis
  │
  ├─ Is data global, multi-region, massive scale?
  │    └─ YES → DynamoDB or CockroachDB
  │
  └─ Starting a new app with unknown access patterns?
       └─ Default to PostgreSQL — you can always migrate later

QUERY PERFORMANCE
  │
  ├─ Query scanning full table (EXPLAIN shows Seq Scan)?
  │    └─ Add index on filter/sort columns
  │
  ├─ Loading list of X then querying each item separately?
  │    └─ N+1 problem — fix with JOIN or batch query
  │
  ├─ Aggregation on millions of rows is slow?
  │    └─ Consider materialised view or pre-aggregation
  │
  └─ Pagination with OFFSET is slow at page 1000+?
       └─ Switch to cursor-based pagination

MIGRATION SAFETY
  │
  ├─ Adding a column?
  │    └─ Add as nullable first → backfill → add NOT NULL constraint
  │
  ├─ Renaming a column?
  │    └─ Add new column → dual-write → migrate reads → drop old column
  │
  ├─ Dropping a column?
  │    └─ Remove from app first → deploy → then drop column
  │
  └─ Adding an index on a large table?
       └─ CREATE INDEX CONCURRENTLY — never block writes
```

---

## Core Rules

1. **Enforce constraints at the DB level** — application bugs happen; the DB is the last line of defence
2. **Never use FLOAT for money** — use DECIMAL/NUMERIC or store as integer cents
3. **Every table needs a primary key** — surrogate (UUID/BIGSERIAL) preferred over composite natural keys
4. **Foreign keys must be indexed** — unindexed FKs cause full table scans on joins
5. **Migrations must be reversible** — always write a DOWN migration
6. **Never DROP in the same migration as data changes** — separate steps, separate deploys
7. **Denormalise only with evidence** — measure first, optimise second (YAGNI for DBs)
8. **NULL means unknown** — not zero, not empty string; be intentional with NULLability
9. **Timestamps on every table** — `created_at`, `updated_at` minimum; soft deletes add `deleted_at`
10. **Name consistently** — `snake_case` for PostgreSQL, singular table names, `_id` suffix for FKs

---

## Reference Files

| File | Load When |
|------|-----------|
| `references/schema-design.md` | Designing tables, choosing types, normalisation, naming |
| `references/indexing-guide.md` | Adding indexes, composite indexes, partial indexes |
| `references/migration-patterns.md` | Writing safe, zero-downtime migrations |
| `references/query-patterns.md` | Fixing N+1, pagination, joins, aggregations |
| `references/nosql-patterns.md` | MongoDB, Redis, DynamoDB, ClickHouse patterns |
| `references/review-template.md` | Structured DB review report |

**Loading rule:** Always load `schema-design.md` for DESIGN mode.
Always load `query-patterns.md` for performance work.
Load `migration-patterns.md` for any schema change on a live system.

---

## Quick Reference Card

| Topic | Rule |
|-------|------|
| Primary key | UUID or BIGSERIAL — never composite natural key as PK |
| Money | DECIMAL(19,4) or integer cents — never FLOAT |
| Enums | DB enum or lookup table — never raw VARCHAR for status fields |
| Timestamps | created_at, updated_at on every table — NOT NULL with DEFAULT NOW() |
| Soft delete | deleted_at TIMESTAMPTZ nullable — index WHERE deleted_at IS NULL |
| FKs | Always add index on FK column |
| Indexes | Max 5-6 per table — each index slows writes |
| N+1 | Fix with JOIN, SELECT IN, or DataLoader |
| Pagination | Cursor-based for large datasets; OFFSET only for < 10k rows |
| Migrations | Zero-downtime: additive first, destructive last, always reversible |
