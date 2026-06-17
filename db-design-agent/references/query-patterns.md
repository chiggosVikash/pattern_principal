# Query Patterns

Common query problems and their solutions. Performance starts with the query, not the index.

---

## 1. N+1 Problem — The Most Common Performance Bug

**What it is:** Loading a list of N items, then making N additional queries to fetch related data.
Result: 1 + N queries instead of 1 or 2.

```typescript
// [ANTI-PATTERN: N+1 in application code]
const orders = await db.query('SELECT * FROM "order" WHERE user_id = $1', [userId]);
// ^ 1 query

for (const order of orders) {
    order.items = await db.query(
        'SELECT * FROM order_item WHERE order_id = $1', [order.id]
    );
    // ^ N queries — one per order!
}
// Total: 1 + N queries. 100 orders = 101 queries.
```

### Fix 1: JOIN
```sql
-- [QUERY: N+1 fixed — JOIN fetches everything in one query]
SELECT
    o.id          AS order_id,
    o.status,
    o.created_at,
    oi.id         AS item_id,
    oi.product_id,
    oi.quantity,
    oi.unit_price
FROM "order" o
LEFT JOIN order_item oi ON oi.order_id = o.id
WHERE o.user_id = $1
ORDER BY o.created_at DESC;
-- Total: 1 query regardless of order count
```

### Fix 2: Batch Query (SELECT IN)
```sql
-- [QUERY: N+1 fixed — batch query for related records]
-- Step 1: fetch orders
SELECT id, status, created_at FROM "order" WHERE user_id = $1;

-- Step 2: fetch ALL items for those orders in one query
SELECT * FROM order_item
WHERE order_id = ANY($1::bigint[]);
-- $1 = array of order IDs from step 1
-- Total: 2 queries regardless of order count
```

```typescript
// TypeScript implementation
const orders = await db.query<Order[]>(
    'SELECT id, status, created_at FROM "order" WHERE user_id = $1', [userId]
);

const orderIds = orders.map(o => o.id);
const items = await db.query<OrderItem[]>(
    'SELECT * FROM order_item WHERE order_id = ANY($1)', [orderIds]
);

// Group items by order_id in memory (O(n) — no extra queries)
const itemsByOrder = items.reduce((map, item) => {
    const list = map.get(item.order_id) ?? [];
    list.push(item);
    return map.set(item.order_id, list);
}, new Map<bigint, OrderItem[]>());

const result = orders.map(order => ({
    ...order,
    items: itemsByOrder.get(order.id) ?? [],
}));
```

### Fix 3: ORM Eager Loading
```typescript
// Prisma — include
const orders = await prisma.order.findMany({
    where: { userId },
    include: { items: { include: { product: true } } },
});

// TypeORM — relations
const orders = await orderRepo.find({
    where: { userId },
    relations: ['items', 'items.product'],
});
```

```python
# SQLAlchemy — joinedload
from sqlalchemy.orm import joinedload

orders = session.query(Order)\
    .options(joinedload(Order.items).joinedload(OrderItem.product))\
    .filter(Order.user_id == user_id)\
    .all()
```

---

## 2. Pagination

### OFFSET Pagination — Simple but Broken at Scale

```sql
-- [QUERY: OFFSET pagination] — works for < 10k rows / small datasets
SELECT id, name, created_at
FROM product
WHERE category_id = $1
ORDER BY created_at DESC
LIMIT 20 OFFSET 200;  -- page 11 of 20 items per page

-- [ANTI-PATTERN: OFFSET at scale]
-- OFFSET 10000 → DB scans and discards 10,000 rows before returning 20
-- Gets slower linearly: page 1000 = 10x slower than page 100
```

### Cursor-Based Pagination — Correct Solution

```sql
-- [QUERY: cursor pagination] — O(1) regardless of page depth
-- First page
SELECT id, name, created_at
FROM product
WHERE category_id = $1
ORDER BY created_at DESC, id DESC
LIMIT 21;  -- fetch 21 to know if there's a next page

-- Next page — cursor = (last_created_at, last_id) from previous page
SELECT id, name, created_at
FROM product
WHERE category_id = $1
  AND (created_at, id) < ($last_created_at, $last_id)  -- cursor condition
ORDER BY created_at DESC, id DESC
LIMIT 21;

-- [INDEX needed for cursor pagination]
CREATE INDEX idx_product_category_cursor
    ON product(category_id, created_at DESC, id DESC);
```

```typescript
// TypeScript cursor pagination implementation
interface CursorPage<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

async function getProducts(
  categoryId: number,
  cursor: string | null,
  pageSize = 20
): Promise<CursorPage<Product>> {
  const limit = pageSize + 1;

  let rows: Product[];
  if (!cursor) {
    rows = await db.query(
      `SELECT id, name, created_at FROM product
       WHERE category_id = $1
       ORDER BY created_at DESC, id DESC LIMIT $2`,
      [categoryId, limit]
    );
  } else {
    const { createdAt, id } = decodeCursor(cursor);
    rows = await db.query(
      `SELECT id, name, created_at FROM product
       WHERE category_id = $1
         AND (created_at, id) < ($2, $3)
       ORDER BY created_at DESC, id DESC LIMIT $4`,
      [categoryId, createdAt, id, limit]
    );
  }

  const hasMore = rows.length > pageSize;
  const items   = rows.slice(0, pageSize);
  const lastItem = items[items.length - 1];

  return {
    items,
    hasMore,
    nextCursor: hasMore ? encodeCursor(lastItem.createdAt, lastItem.id) : null,
  };
}

const encodeCursor = (createdAt: Date, id: number) =>
  Buffer.from(JSON.stringify({ createdAt, id })).toString('base64');

const decodeCursor = (cursor: string) =>
  JSON.parse(Buffer.from(cursor, 'base64').toString());
```

---

## 3. Aggregation Patterns

```sql
-- [QUERY: aggregation with GROUP BY]
-- Count orders per status for dashboard
SELECT
    status,
    COUNT(*)                           AS total_orders,
    SUM(total)                         AS revenue,
    AVG(total)                         AS avg_order_value,
    MIN(created_at)                    AS first_order,
    MAX(created_at)                    AS last_order
FROM "order"
WHERE created_at >= NOW() - INTERVAL '30 days'
GROUP BY status
ORDER BY total_orders DESC;

-- [QUERY: aggregation with HAVING — filter after grouping]
-- Users with more than 5 orders in last 30 days
SELECT
    user_id,
    COUNT(*)  AS order_count,
    SUM(total) AS total_spent
FROM "order"
WHERE created_at >= NOW() - INTERVAL '30 days'
GROUP BY user_id
HAVING COUNT(*) > 5
ORDER BY total_spent DESC;
```

---

## 4. Window Functions — Ranking Without Subqueries

```sql
-- [QUERY: window function — rank, partition, running total]

-- Rank products by revenue within each category
SELECT
    id,
    name,
    category_id,
    revenue,
    RANK()       OVER (PARTITION BY category_id ORDER BY revenue DESC) AS rank_in_category,
    ROW_NUMBER() OVER (PARTITION BY category_id ORDER BY revenue DESC) AS row_num,
    DENSE_RANK() OVER (PARTITION BY category_id ORDER BY revenue DESC) AS dense_rank
FROM product_revenue_view;

-- Running total of revenue by day
SELECT
    DATE(created_at) AS day,
    SUM(total)       AS daily_revenue,
    SUM(SUM(total)) OVER (ORDER BY DATE(created_at)) AS running_total
FROM "order"
WHERE created_at >= NOW() - INTERVAL '30 days'
GROUP BY DATE(created_at)
ORDER BY day;

-- Previous and next values (lag/lead)
SELECT
    id,
    user_id,
    total,
    created_at,
    LAG(total)  OVER (PARTITION BY user_id ORDER BY created_at) AS prev_order_total,
    LEAD(total) OVER (PARTITION BY user_id ORDER BY created_at) AS next_order_total
FROM "order";

-- Get top N per group (e.g. top 3 products per category)
SELECT * FROM (
    SELECT
        *,
        ROW_NUMBER() OVER (PARTITION BY category_id ORDER BY revenue DESC) AS rn
    FROM product
) ranked
WHERE rn <= 3;
```

---

## 5. Common Table Expressions (CTEs)

```sql
-- [QUERY: CTE — readable, composable, replaces subqueries]

-- Find users who placed orders but have no subscription
WITH active_orders AS (
    SELECT DISTINCT user_id
    FROM "order"
    WHERE created_at >= NOW() - INTERVAL '90 days'
      AND status = 'fulfilled'
),
subscribed_users AS (
    SELECT DISTINCT user_id
    FROM subscription
    WHERE status = 'active'
)
SELECT u.id, u.name, u.email
FROM "user" u
JOIN active_orders ao ON ao.user_id = u.id
LEFT JOIN subscribed_users su ON su.user_id = u.id
WHERE su.user_id IS NULL
ORDER BY u.created_at DESC;

-- Recursive CTE — category tree traversal
WITH RECURSIVE category_tree AS (
    -- Base case: root categories
    SELECT id, name, parent_id, 0 AS depth, name::TEXT AS path
    FROM category
    WHERE parent_id IS NULL

    UNION ALL

    -- Recursive case: children
    SELECT c.id, c.name, c.parent_id, ct.depth + 1,
           ct.path || ' > ' || c.name
    FROM category c
    JOIN category_tree ct ON ct.id = c.parent_id
)
SELECT * FROM category_tree ORDER BY path;
```

---

## 6. Upsert Pattern

```sql
-- [QUERY: upsert — insert or update in one atomic operation]

-- PostgreSQL ON CONFLICT
INSERT INTO user_preference (user_id, key, value, updated_at)
VALUES ($1, $2, $3, NOW())
ON CONFLICT (user_id, key)
DO UPDATE SET
    value      = EXCLUDED.value,
    updated_at = NOW()
RETURNING *;

-- Upsert with condition — only update if newer
INSERT INTO product_price (product_id, price, effective_from)
VALUES ($1, $2, $3)
ON CONFLICT (product_id)
DO UPDATE SET
    price          = EXCLUDED.price,
    effective_from = EXCLUDED.effective_from
WHERE product_price.effective_from < EXCLUDED.effective_from;
```

---

## 7. Materialised Views — Pre-computed Aggregations

```sql
-- [QUERY: materialised view — cache expensive aggregation]
-- Useful when: query takes >500ms, data can be slightly stale

CREATE MATERIALISED VIEW order_daily_summary AS
SELECT
    DATE(created_at)   AS day,
    COUNT(*)           AS order_count,
    SUM(total)         AS revenue,
    COUNT(DISTINCT user_id) AS unique_customers
FROM "order"
WHERE status = 'fulfilled'
GROUP BY DATE(created_at)
WITH DATA;

-- Index the materialised view
CREATE INDEX idx_order_daily_summary_day ON order_daily_summary(day DESC);

-- Refresh strategies
REFRESH MATERIALISED VIEW order_daily_summary;                    -- blocks reads
REFRESH MATERIALISED VIEW CONCURRENTLY order_daily_summary;      -- non-blocking, needs unique index

-- Schedule via pg_cron (PostgreSQL extension)
SELECT cron.schedule('refresh-daily-summary', '0 * * * *',
    'REFRESH MATERIALISED VIEW CONCURRENTLY order_daily_summary');
```

---

## Query Performance Checklist

```
BEFORE SHIPPING A QUERY
════════════════════════════
[ ] EXPLAIN (ANALYSE, BUFFERS) run — no unexpected Seq Scans
[ ] N+1 checked — no queries inside loops
[ ] OFFSET avoided for large datasets — cursor pagination used
[ ] Aggregations on large tables use indexes or materialised views
[ ] JOINs have indexes on both sides of the join condition
[ ] Subqueries replaced with CTEs or JOINs where appropriate
[ ] Window functions used instead of correlated subqueries
[ ] Query tested on production-size data
```
