# Indexing Guide

Indexes make reads fast and writes slower. Every index is a trade-off.
This guide tells you when to add one, what kind, and what to avoid.

---

## The Core Rules

1. **Index every foreign key column** — unindexed FKs cause full table scans on JOIN
2. **Index columns in WHERE, ORDER BY, GROUP BY** — if queries filter/sort on it, index it
3. **Max 5-6 indexes per table** — each index adds overhead to INSERT/UPDATE/DELETE
4. **Never index low-cardinality columns alone** — `is_active` (2 values) is nearly useless as a single-column index
5. **Always use `CONCURRENTLY`** on live tables — never block writes with index creation
6. **Measure before adding** — use `EXPLAIN ANALYSE` to verify the index is used

---

## 1. Single-Column Index

```sql
-- [INDEX: single] — most common, filter by one column
CREATE INDEX idx_order_user_id      ON "order"(user_id);
CREATE INDEX idx_order_created_at   ON "order"(created_at DESC);  -- DESC for "latest first"
CREATE INDEX idx_product_category   ON product(category_id);

-- Always CONCURRENTLY on live tables
CREATE INDEX CONCURRENTLY idx_user_email ON "user"(email);
```

---

## 2. Composite Index — Column Order Matters

```sql
-- [INDEX: composite] — covers queries that filter/sort on multiple columns
-- Rule: most selective column first, then sort column

-- Query: WHERE user_id = ? ORDER BY created_at DESC
-- Composite covers both filter and sort in one index
CREATE INDEX idx_order_user_created
    ON "order"(user_id, created_at DESC);

-- Query: WHERE status = 'active' AND created_at > ?
CREATE INDEX idx_order_status_created
    ON "order"(status, created_at DESC);

-- [ANTI-PATTERN: wrong column order]
-- Query: WHERE user_id = ? AND status = ?
CREATE INDEX idx_wrong ON "order"(status, user_id);
-- ↑ PostgreSQL can use this but must scan all statuses first
-- [FIX: put high-cardinality column first]
CREATE INDEX idx_right ON "order"(user_id, status);

-- The "leftmost prefix" rule:
-- Index on (a, b, c) covers:
--   WHERE a = ?              ✓
--   WHERE a = ? AND b = ?    ✓
--   WHERE a = ? ORDER BY b   ✓
--   WHERE b = ?              ✗ (doesn't use index — b is not leftmost)
```

---

## 3. Partial Index — Index Only What You Query

```sql
-- [INDEX: partial] — smaller, faster, more selective

-- Only active users are queried 99% of the time
CREATE INDEX idx_user_email_active
    ON "user"(email)
    WHERE deleted_at IS NULL;

-- Only pending orders need the created_at scan
CREATE INDEX idx_order_pending_created
    ON "order"(created_at)
    WHERE status = 'pending';

-- Unique constraint only for active subscriptions (allow multiple cancelled)
CREATE UNIQUE INDEX idx_subscription_one_active_per_user
    ON subscription(user_id)
    WHERE status = 'active';

-- [BENEFIT] partial indexes are smaller → fit in memory → faster cache hits
```

---

## 4. Covering Index (INCLUDE)

```sql
-- [INDEX: covering] — index includes all columns the query needs
-- Query reads only the index, never touches the table (index-only scan)

-- Query: SELECT id, status, total FROM "order" WHERE user_id = ? ORDER BY created_at DESC
-- Without covering: index scan + heap fetch for status and total
-- With covering: index-only scan — no heap access
CREATE INDEX idx_order_user_covering
    ON "order"(user_id, created_at DESC)
    INCLUDE (status, total);    -- extra columns carried in index

-- [RULE] INCLUDE only columns that are SELECTed, not filtered/sorted
-- Filtering/sorting columns go in the main index definition
```

---

## 5. Expression Index

```sql
-- [INDEX: expression] — index on computed value, not raw column

-- Query: WHERE LOWER(email) = LOWER(?) — case-insensitive lookup
-- Without expression index: full table scan
CREATE INDEX idx_user_email_lower ON "user"(LOWER(email));

-- Query: WHERE DATE(created_at) = '2024-01-15' — date part only
CREATE INDEX idx_order_date ON "order"(DATE(created_at));

-- Query: WHERE (metadata->>'category') = ? — JSONB field
CREATE INDEX idx_product_category_jsonb ON product((metadata->>'category'));

-- Query: WHERE status IN ('pending', 'processing') — computed boolean
CREATE INDEX idx_order_needs_action ON "order"(id)
    WHERE status IN ('pending', 'processing');
```

---

## 6. Full-Text Search Index

```sql
-- [INDEX: GIN full-text] — text search on PostgreSQL
ALTER TABLE product ADD COLUMN search_vector TSVECTOR;

CREATE INDEX idx_product_search ON product USING GIN(search_vector);

-- Keep search_vector updated via trigger
CREATE OR REPLACE FUNCTION update_product_search() RETURNS TRIGGER AS $$
BEGIN
    NEW.search_vector := to_tsvector('english',
        COALESCE(NEW.name, '') || ' ' ||
        COALESCE(NEW.description, '')
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_product_search
    BEFORE INSERT OR UPDATE ON product
    FOR EACH ROW EXECUTE FUNCTION update_product_search();

-- Query
SELECT * FROM product
WHERE search_vector @@ plainto_tsquery('english', 'wireless headphones')
ORDER BY ts_rank(search_vector, plainto_tsquery('english', 'wireless headphones')) DESC;
```

---

## 7. JSONB Index

```sql
-- [INDEX: GIN JSONB] — index entire JSONB column for @> containment queries
CREATE INDEX idx_product_metadata ON product USING GIN(metadata);

-- Query: find products with specific attribute
SELECT * FROM product WHERE metadata @> '{"brand": "Sony"}';

-- [INDEX: expression on JSONB key] — for specific key equality queries
CREATE INDEX idx_product_brand ON product((metadata->>'brand'));

-- Query using expression index:
SELECT * FROM product WHERE metadata->>'brand' = 'Sony';
```

---

## 8. Detecting Missing Indexes

```sql
-- Find sequential scans on large tables (PostgreSQL)
SELECT schemaname, tablename, seq_scan, seq_tup_read,
       idx_scan, idx_tup_fetch,
       seq_tup_read / NULLIF(seq_scan, 0) AS avg_rows_per_seq_scan
FROM pg_stat_user_tables
WHERE seq_scan > 0
ORDER BY seq_tup_read DESC
LIMIT 20;

-- Find unused indexes (wasting write performance)
SELECT schemaname, tablename, indexname, idx_scan
FROM pg_stat_user_indexes
WHERE idx_scan = 0
  AND indexname NOT LIKE '%pkey%'  -- exclude PKs
ORDER BY pg_relation_size(indexrelid) DESC;

-- EXPLAIN ANALYSE — always check before and after adding index
EXPLAIN (ANALYSE, BUFFERS, FORMAT TEXT)
SELECT * FROM "order"
WHERE user_id = 123
ORDER BY created_at DESC
LIMIT 20;

-- Look for:
-- ✓ Index Scan        → good
-- ✓ Index Only Scan   → best (covering index hit)
-- ✗ Seq Scan          → missing index on filter column
-- ✗ Bitmap Heap Scan  → index exists but selectivity is low
```

---

## 9. Index Anti-Patterns

```sql
-- [ANTI-PATTERN: index on low-cardinality boolean alone]
CREATE INDEX idx_order_is_deleted ON "order"(is_deleted);
-- ↑ Only 2 values — table scan is faster for >5% selectivity
-- [FIX: use partial index instead]
CREATE INDEX idx_order_not_deleted ON "order"(id) WHERE NOT is_deleted;

-- [ANTI-PATTERN: redundant indexes]
CREATE INDEX idx_a   ON "order"(user_id);
CREATE INDEX idx_ab  ON "order"(user_id, status);
-- ↑ idx_a is redundant — idx_ab covers single-column user_id queries too
-- [FIX: keep only idx_ab]

-- [ANTI-PATTERN: too many indexes on write-heavy table]
-- A table with 10 indexes: every INSERT touches 10 B-trees
-- [FIX: audit with pg_stat_user_indexes, drop unused ones]

-- [ANTI-PATTERN: indexing before understanding query patterns]
-- Don't add indexes speculatively — add them when EXPLAIN shows Seq Scan
```

---

## Index Decision Guide

```
Is this a FK column?
  YES → CREATE INDEX immediately (always)

Is this column in a WHERE / ORDER BY / GROUP BY clause?
  YES → consider an index

  Is cardinality high (many distinct values)?
    YES → single-column index
    NO  → partial index or composite with selective column first

Do multiple columns always appear together in queries?
  YES → composite index (selective column first)

Does the query SELECT only indexed columns?
  YES → add INCLUDE to make it a covering index

Is the WHERE clause a subset of rows (e.g. WHERE status='active')?
  YES → partial index

Is it a text search requirement?
  YES → GIN index on tsvector

Is it a JSONB containment query?
  YES → GIN index on JSONB column

Is the table large and production live?
  YES → always CREATE INDEX CONCURRENTLY
```
