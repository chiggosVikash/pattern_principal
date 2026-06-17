# NoSQL Patterns

When to use which database, and how to design data for it.
NoSQL is not a replacement for relational — it's a different tool for different access patterns.

---

## Database Selection Guide

```
What is your PRIMARY access pattern?

  Structured relational data + complex queries?
  └─ PostgreSQL (default — can do most things)

  Document data with variable schema?
  └─ MongoDB OR PostgreSQL JSONB (if you already have Postgres)

  High-throughput key-value: cache / session / queue / leaderboard?
  └─ Redis

  Time-series: metrics / events / logs / IoT?
  └─ ClickHouse or TimescaleDB

  Global scale + multi-region + massive throughput?
  └─ DynamoDB (AWS) or CockroachDB

  Full-text search?
  └─ Elasticsearch OR PostgreSQL full-text (for moderate scale)

  [YAGNI] Starting out with unknown access patterns?
  └─ PostgreSQL — always start here; migrate when you have evidence
```

---

## 1. MongoDB — Document Patterns

### When to Use
- Product catalogues (attributes vary per category)
- Content management (articles, comments, media)
- User profiles with flexible attributes
- When schema evolution is frequent

### Embedding vs Referencing

```javascript
// [PATTERN: Embed] — data queried together, lives together
// Rule: if you always fetch child with parent → embed
// Rule: if child count is bounded (< ~100) → embed

// Good embedding: order with items (always fetched together, bounded count)
{
    _id: ObjectId("..."),
    userId: "usr_001",
    status: "pending",
    total: NumberDecimal("1499.00"),
    currency: "INR",
    items: [                           // embedded — fetched with every order
        {
            productId: "prd_001",
            name: "Wireless Headphones", // denormalised name for history
            quantity: 1,
            unitPrice: NumberDecimal("1499.00")
        }
    ],
    createdAt: ISODate("2024-01-15T10:30:00Z"),
    updatedAt: ISODate("2024-01-15T10:30:00Z")
}

// [PATTERN: Reference] — data queried independently, large, or unbounded
// Good referencing: user → orders (user has many orders, queried separately)
{
    _id: ObjectId("..."),
    name: "Vikash Kumar",
    email: "vikash@parivartanx.com",
    // orders NOT embedded here — could be thousands
    // query orders collection with filter: { userId: this._id }
}
```

### Schema Design by Access Pattern

```javascript
// [PATTERN: Design for reads, not writes]
// Query: "Get product with all its reviews and avg rating"

// Bad design (requires multiple queries):
// products collection: { _id, name, price }
// reviews collection: { _id, productId, rating, body }
// → 2 queries + application-side join

// Good design (single query):
{
    _id: ObjectId("..."),
    name: "Wireless Headphones",
    price: NumberDecimal("1499.00"),
    avgRating: 4.3,          // denormalised — updated on review write
    reviewCount: 127,        // denormalised
    recentReviews: [         // last 5 reviews embedded
        { userId: "usr_001", rating: 5, body: "Great!", createdAt: ISODate("...") }
    ]
    // full reviews in separate collection for pagination
}

// [INDEX: MongoDB]
db.product.createIndex({ category: 1, price: 1 })          // compound
db.product.createIndex({ name: "text", description: "text" }) // full-text
db.product.createIndex({ "location": "2dsphere" })          // geospatial
db.order.createIndex({ userId: 1, createdAt: -1 })          // user order history
db.order.createIndex({ status: 1, createdAt: -1 },
    { partialFilterExpression: { status: { $in: ["pending", "processing"] } } })  // partial
```

### Transactions in MongoDB

```javascript
// [PATTERN: multi-document transaction — MongoDB 4.0+]
// Use sparingly — transactions have overhead; embed when possible

const session = await client.startSession();
try {
    session.startTransaction();

    await db.collection('order').insertOne(order, { session });
    await db.collection('inventory').updateOne(
        { productId: order.productId, quantity: { $gte: order.quantity } },
        { $inc: { quantity: -order.quantity } },
        { session }
    );

    await session.commitTransaction();
} catch (error) {
    await session.abortTransaction();
    throw error;
} finally {
    session.endSession();
}
```

---

## 2. Redis — Data Structure Patterns

### Key Naming Convention
```
{app}:{entity}:{id}:{field}
Examples:
  myapp:session:usr_001
  myapp:cache:product:prd_001
  myapp:ratelimit:ip:192.168.1.1
  myapp:leaderboard:global:2024-01
```

### Pattern 1: Cache-Aside
```typescript
// [PATTERN: Cache-Aside] — read from cache, fallback to DB
async function getProduct(id: string): Promise<Product> {
    const cacheKey = `myapp:cache:product:${id}`;

    // 1. Try cache first
    const cached = await redis.get(cacheKey);
    if (cached) return JSON.parse(cached);  // [CACHE HIT]

    // 2. Cache miss — fetch from DB
    const product = await db.product.findById(id);
    if (!product) throw new NotFoundError(id);

    // 3. Store in cache with TTL
    await redis.setex(cacheKey, 3600, JSON.stringify(product)); // 1 hour TTL

    return product;
}

// Invalidate on update
async function updateProduct(id: string, data: Partial<Product>) {
    await db.product.update(id, data);
    await redis.del(`myapp:cache:product:${id}`); // [CACHE INVALIDATION]
}
```

### Pattern 2: Session Storage
```typescript
// [PATTERN: Redis session]
async function createSession(userId: string): Promise<string> {
    const sessionId = crypto.randomUUID();
    const key = `myapp:session:${sessionId}`;

    await redis.hset(key, {
        userId,
        createdAt: Date.now(),
        lastAccessAt: Date.now(),
    });
    await redis.expire(key, 86400); // 24 hours

    return sessionId;
}

async function getSession(sessionId: string) {
    const key = `myapp:session:${sessionId}`;
    const session = await redis.hgetall(key);
    if (!session.userId) return null;

    await redis.expire(key, 86400); // sliding expiry
    return session;
}
```

### Pattern 3: Rate Limiting
```typescript
// [PATTERN: Redis rate limit — sliding window]
async function checkRateLimit(
    identifier: string,  // IP or userId
    limit: number,
    windowSeconds: number
): Promise<boolean> {
    const key = `myapp:ratelimit:${identifier}`;
    const now = Date.now();
    const windowStart = now - windowSeconds * 1000;

    const pipeline = redis.pipeline();
    pipeline.zremrangebyscore(key, 0, windowStart);     // remove old entries
    pipeline.zadd(key, now, `${now}`);                  // add current request
    pipeline.zcard(key);                                // count in window
    pipeline.expire(key, windowSeconds);                // cleanup

    const results = await pipeline.exec();
    const count = results[2][1] as number;

    return count <= limit;
}
```

### Pattern 4: Leaderboard
```typescript
// [PATTERN: Redis sorted set leaderboard]
// Add/update score
await redis.zadd('myapp:leaderboard:global', score, userId);

// Get top 10
const top10 = await redis.zrevrange('myapp:leaderboard:global', 0, 9, 'WITHSCORES');

// Get user rank (0-indexed)
const rank = await redis.zrevrank('myapp:leaderboard:global', userId);

// Get user score
const score = await redis.zscore('myapp:leaderboard:global', userId);
```

### Pattern 5: Pub/Sub & Message Queue
```typescript
// [PATTERN: Redis Streams — durable message queue]
// Producer
await redis.xadd('myapp:orders:stream', '*', {
    orderId: order.id,
    event:   'order.placed',
    payload: JSON.stringify(order),
});

// Consumer group
await redis.xgroup('CREATE', 'myapp:orders:stream', 'notification-service', '0', 'MKSTREAM');

// Consumer
const messages = await redis.xreadgroup(
    'GROUP', 'notification-service', 'consumer-1',
    'COUNT', 10, 'BLOCK', 0,
    'STREAMS', 'myapp:orders:stream', '>'
);

for (const [, entries] of messages) {
    for (const [id, fields] of entries) {
        await processMessage(fields);
        await redis.xack('myapp:orders:stream', 'notification-service', id);
    }
}
```

---

## 3. DynamoDB — Single-Table Design

### Access Pattern First
```
DynamoDB rule: define ALL access patterns before designing the schema.
The schema is derived from the access patterns — opposite of relational.

Example access patterns for an e-commerce app:
1. Get user by ID
2. Get order by ID
3. Get all orders for a user
4. Get all orders by status (admin)
5. Get order items for an order
```

### Single-Table Design
```typescript
// [PATTERN: DynamoDB single-table — all entities in one table]
// PK = partition key, SK = sort key

// User record
{ PK: "USER#usr_001",     SK: "PROFILE",           name: "Vikash", email: "..." }

// Order record (access pattern 2: get by ID)
{ PK: "ORDER#ord_001",    SK: "METADATA",          userId: "usr_001", status: "pending", total: 1499 }

// User-Order relation (access pattern 3: get orders for user)
{ PK: "USER#usr_001",     SK: "ORDER#ord_001",      status: "pending", createdAt: "2024-01-15" }

// Order item (access pattern 5: get items for order)
{ PK: "ORDER#ord_001",    SK: "ITEM#itm_001",       productId: "prd_001", qty: 1, price: 1499 }

// GSI for admin queries (access pattern 4: orders by status)
// GSI PK: status, GSI SK: createdAt
{ PK: "ORDER#ord_001",    SK: "METADATA",   GSI1PK: "STATUS#pending", GSI1SK: "2024-01-15T10:30:00Z" }
```

```typescript
// Query: get all orders for a user
const result = await dynamodb.query({
    TableName: 'myapp',
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
    ExpressionAttributeValues: {
        ':pk': { S: `USER#${userId}` },
        ':sk': { S: 'ORDER#' },
    },
});
```

---

## 4. ClickHouse — Analytics Patterns

### When to Use
- Events / logs (billions of rows)
- Time-series metrics
- Analytics dashboards with aggregations over huge datasets
- OLAP (not OLTP — no row-level updates)

```sql
-- [CLICKHOUSE: table design — MergeTree engine]
CREATE TABLE order_events (
    event_id     UUID            DEFAULT generateUUIDv4(),
    event_type   LowCardinality(String),  -- LowCardinality for repeated strings
    user_id      UInt64,
    order_id     UUID,
    amount       Decimal(19, 4),
    currency     LowCardinality(String),
    created_at   DateTime64(3, 'UTC'),    -- millisecond precision
    properties   String                   -- JSON for flexible attributes
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(created_at)         -- monthly partitions
ORDER BY (event_type, user_id, created_at) -- sort key = primary index
SETTINGS index_granularity = 8192;

-- [CLICKHOUSE: materialized view for pre-aggregation]
CREATE MATERIALISED VIEW daily_revenue_mv
ENGINE = SummingMergeTree()
PARTITION BY toYYYYMM(day)
ORDER BY (day, currency)
AS SELECT
    toDate(created_at) AS day,
    currency,
    sum(amount)        AS total_revenue,
    count()            AS order_count
FROM order_events
WHERE event_type = 'order.completed'
GROUP BY day, currency;

-- Fast dashboard query against pre-aggregated view
SELECT day, currency, total_revenue, order_count
FROM daily_revenue_mv
WHERE day >= today() - 30
ORDER BY day DESC;
```

---

## NoSQL Decision Checklist

```
CHOOSING A DATABASE
════════════════════════════════════
[ ] Access patterns defined before choosing DB
[ ] PostgreSQL considered first (default) — reason to deviate documented
[ ] MongoDB chosen? → embedding strategy matches primary query pattern
[ ] Redis chosen? → TTL and eviction policy set; persistence configured if needed
[ ] DynamoDB chosen? → single-table design with all access patterns mapped
[ ] ClickHouse chosen? → OLAP only; no row updates; partition key defined
[ ] Multiple DBs? → each DB owns its data; no cross-DB joins in app layer

DATA MODELING REVIEW
[ ] Document: embed vs reference decision documented with reasoning
[ ] Redis: key naming convention follows {app}:{entity}:{id} pattern
[ ] Redis: TTL set on all keys (no unbounded memory growth)
[ ] DynamoDB: all access patterns covered by PK/SK or GSI
[ ] ClickHouse: partition key distributes data evenly; ORDER BY matches queries
```
