# Schema Design Reference

Principles and patterns for designing correct, maintainable relational schemas.

---

## 1. Normalisation

### 1NF — First Normal Form
- Every column holds atomic (indivisible) values
- No repeating groups or arrays in columns

```sql
-- [ANTI-PATTERN: 1NF violation — multiple values in one column]
CREATE TABLE orders (
    id          BIGSERIAL PRIMARY KEY,
    product_ids VARCHAR(255) -- "1,2,3,45" ← violates 1NF
);

-- [FIX: separate junction table]
CREATE TABLE orders (id BIGSERIAL PRIMARY KEY, user_id BIGINT NOT NULL);
CREATE TABLE order_items (
    id         BIGSERIAL PRIMARY KEY,
    order_id   BIGINT NOT NULL REFERENCES orders(id),
    product_id BIGINT NOT NULL REFERENCES products(id),
    quantity   INT    NOT NULL DEFAULT 1 CHECK (quantity > 0),
    unit_price DECIMAL(19,4) NOT NULL  -- [TYPE: DECIMAL] price at time of order
);
```

### 2NF — Second Normal Form
- Must be in 1NF
- Every non-key column depends on the WHOLE primary key (no partial dependency)

```sql
-- [ANTI-PATTERN: 2NF violation — customer_name depends only on customer_id, not full PK]
CREATE TABLE order_items (
    order_id      BIGINT,
    product_id    BIGINT,
    customer_name VARCHAR(255), -- ← depends only on order_id.customer_id
    quantity      INT,
    PRIMARY KEY (order_id, product_id)
);

-- [FIX: move customer_name to the orders/customers table where it belongs]
CREATE TABLE customers (
    id   BIGSERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL
);
CREATE TABLE orders (
    id          BIGSERIAL PRIMARY KEY,
    customer_id BIGINT NOT NULL REFERENCES customers(id) -- [CONSTRAINT: FK]
);
```

### 3NF — Third Normal Form (default target)
- Must be in 2NF
- No transitive dependencies (non-key column depending on another non-key column)

```sql
-- [ANTI-PATTERN: 3NF violation — city depends on zip_code, not on user_id]
CREATE TABLE users (
    id       BIGSERIAL PRIMARY KEY,
    name     VARCHAR(255),
    zip_code VARCHAR(10),
    city     VARCHAR(100)  -- ← city determined by zip_code, not by user
);

-- [FIX: 3NF — extract zip → city mapping]
CREATE TABLE zip_codes (
    zip_code VARCHAR(10)  PRIMARY KEY,
    city     VARCHAR(100) NOT NULL,
    state    VARCHAR(100) NOT NULL
);
CREATE TABLE users (
    id       BIGSERIAL PRIMARY KEY,
    name     VARCHAR(255) NOT NULL,
    zip_code VARCHAR(10)  REFERENCES zip_codes(zip_code)
);
```

### When to Denormalise (and how to document it)
```sql
-- [DENORM: justified] — order_total cached to avoid summing 10M order_items on every list
-- Evidence: EXPLAIN ANALYSE showed 800ms query; cached total brings it to 2ms
-- Consistency: order_total updated via trigger on order_items INSERT/UPDATE/DELETE
ALTER TABLE orders ADD COLUMN order_total DECIMAL(19,4) NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION sync_order_total() RETURNS TRIGGER AS $$
BEGIN
    UPDATE orders
    SET order_total = (SELECT COALESCE(SUM(unit_price * quantity), 0)
                       FROM order_items WHERE order_id = NEW.order_id)
    WHERE id = NEW.order_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

---

## 2. Naming Conventions

```sql
-- [SCHEMA: naming conventions]
-- Tables:    snake_case, singular noun
-- Columns:   snake_case
-- PKs:       id (BIGSERIAL or UUID)
-- FKs:       {referenced_table}_id  e.g. user_id, order_id
-- Booleans:  is_{state} or has_{thing}  e.g. is_active, has_subscription
-- Timestamps: created_at, updated_at, deleted_at, {event}_at e.g. confirmed_at
-- Indexes:   idx_{table}_{columns}  e.g. idx_orders_user_id_created_at
-- FKs:       fk_{table}_{referenced_table}

-- GOOD
CREATE TABLE product_review (
    id           BIGSERIAL PRIMARY KEY,
    product_id   BIGINT        NOT NULL REFERENCES product(id),  -- FK naming
    user_id      BIGINT        NOT NULL REFERENCES "user"(id),
    is_verified  BOOLEAN       NOT NULL DEFAULT FALSE,
    rating       SMALLINT      NOT NULL CHECK (rating BETWEEN 1 AND 5),
    body         TEXT,
    created_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- BAD — these are anti-patterns
-- ProductReviews     ← PascalCase, plural
-- prod_rev_tbl       ← abbreviated, suffix
-- ReviewID           ← camelCase, inconsistent
-- review_date        ← ambiguous (created? updated? reviewed?)
```

---

## 3. Data Types

### Choose Precisely

```sql
-- [ANTI-PATTERN: VARCHAR for everything]
CREATE TABLE product (
    id          VARCHAR(255),   -- should be BIGSERIAL or UUID
    price       VARCHAR(255),   -- should be DECIMAL(19,4)
    is_active   VARCHAR(255),   -- should be BOOLEAN
    quantity    VARCHAR(255),   -- should be INT
    created_at  VARCHAR(255)    -- should be TIMESTAMPTZ
);

-- [FIX: precise types]
CREATE TABLE product (
    id          BIGSERIAL     PRIMARY KEY,
    -- OR: id  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),

    name        VARCHAR(255)  NOT NULL,
    description TEXT,                       -- TEXT for unbounded strings
    price       DECIMAL(19,4) NOT NULL,     -- [TYPE: DECIMAL] never FLOAT for money
    quantity    INT           NOT NULL DEFAULT 0 CHECK (quantity >= 0),
    is_active   BOOLEAN       NOT NULL DEFAULT TRUE,
    category    VARCHAR(50)   NOT NULL,     -- or FK to category table
    metadata    JSONB,                      -- flexible attributes
    created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
```

### Type Reference

| Use Case | Correct Type | Never Use |
|----------|-------------|-----------|
| Primary key (auto) | `BIGSERIAL` / `BIGINT GENERATED ALWAYS AS IDENTITY` | `INT` (overflows at 2B) |
| Primary key (distributed) | `UUID` with `DEFAULT gen_random_uuid()` | Sequential int (hotspot) |
| Money / price | `DECIMAL(19,4)` or `BIGINT` (cents) | `FLOAT`, `REAL`, `DOUBLE` |
| Short text (bounded) | `VARCHAR(n)` with appropriate n | `VARCHAR(255)` always |
| Long text (unbounded) | `TEXT` | `VARCHAR(MAX)` |
| Flag / toggle | `BOOLEAN NOT NULL DEFAULT FALSE` | `TINYINT`, `CHAR(1)` |
| Status / state | `VARCHAR(50)` + `CHECK` or DB enum | Raw magic strings |
| Timestamp with timezone | `TIMESTAMPTZ` | `TIMESTAMP` (timezone-naive) |
| Date only | `DATE` | `TIMESTAMP` |
| Counter | `INT` or `BIGINT` | `VARCHAR` |
| JSON data | `JSONB` (indexed, binary) | `JSON` (text, not indexed) |
| File path / URL | `TEXT` | `VARCHAR(255)` (URLs can be long) |
| Phone number | `VARCHAR(20)` | `BIGINT` (loses leading zeros) |
| IP address | `INET` (PostgreSQL) | `VARCHAR` |

### UUID vs BIGSERIAL

```sql
-- [TYPE: UUID] — use when:
-- - Distributed system, multiple DB nodes
-- - IDs exposed in URLs (not guessable sequence)
-- - Merging data from multiple sources
CREATE TABLE user_session (
    id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    BIGINT      NOT NULL REFERENCES "user"(id),
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- [TYPE: BIGSERIAL] — use when:
-- - Single DB node
-- - Internal IDs not exposed publicly
-- - Maximum insert performance needed (sequential = better B-tree locality)
CREATE TABLE audit_log (
    id         BIGSERIAL   PRIMARY KEY,
    event_type VARCHAR(100) NOT NULL,
    payload    JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

## 4. Constraints — Enforce at DB Level

```sql
-- [CONSTRAINT: comprehensive example]
CREATE TABLE subscription (
    id              BIGSERIAL     PRIMARY KEY,
    user_id         BIGINT        NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    plan_id         BIGINT        NOT NULL REFERENCES plan(id),
    status          VARCHAR(20)   NOT NULL DEFAULT 'active'
                                  CHECK (status IN ('active','paused','cancelled','expired')),
    amount          DECIMAL(19,4) NOT NULL CHECK (amount >= 0),
    currency        CHAR(3)       NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
    billing_cycle   VARCHAR(20)   NOT NULL CHECK (billing_cycle IN ('monthly','annual')),
    starts_at       TIMESTAMPTZ   NOT NULL,
    ends_at         TIMESTAMPTZ,
    cancelled_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

    -- [CONSTRAINT: business rule] end must be after start
    CONSTRAINT chk_subscription_dates CHECK (ends_at IS NULL OR ends_at > starts_at),
    -- [CONSTRAINT: business rule] cancelled_at only set when status=cancelled
    CONSTRAINT chk_cancelled_at CHECK (
        (status = 'cancelled' AND cancelled_at IS NOT NULL) OR
        (status != 'cancelled' AND cancelled_at IS NULL)
    )
);

-- [CONSTRAINT: unique] prevent duplicate active subscriptions per user
CREATE UNIQUE INDEX idx_subscription_active_user
    ON subscription(user_id)
    WHERE status = 'active';  -- partial unique index — only one active per user
```

---

## 5. Standard Table Template

Apply this to every new table:

```sql
-- Standard table template
CREATE TABLE {entity} (
    -- Identity
    id          BIGSERIAL    PRIMARY KEY,
    -- OR: id  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Foreign keys (add index immediately)
    {parent}_id BIGINT       NOT NULL REFERENCES {parent}(id),

    -- Business columns
    -- ...

    -- Soft delete
    deleted_at  TIMESTAMPTZ,  -- NULL = active; non-NULL = deleted

    -- Audit timestamps
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Index every FK immediately
CREATE INDEX idx_{entity}_{parent}_id ON {entity}({parent}_id);

-- Index for soft-delete queries
CREATE INDEX idx_{entity}_active ON {entity}(id) WHERE deleted_at IS NULL;

-- Auto-update updated_at
CREATE OR REPLACE TRIGGER trg_{entity}_updated_at
    BEFORE UPDATE ON {entity}
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

---

## 6. ORM Schema Examples

### Prisma (TypeScript)
```prisma
model Order {
  id         BigInt      @id @default(autoincrement())
  userId     BigInt
  status     OrderStatus @default(PENDING)
  total      Decimal     @db.Decimal(19, 4)
  createdAt  DateTime    @default(now()) @db.Timestamptz
  updatedAt  DateTime    @updatedAt @db.Timestamptz
  deletedAt  DateTime?   @db.Timestamptz

  user       User        @relation(fields: [userId], references: [id])
  items      OrderItem[]

  @@index([userId])
  @@index([status, createdAt])
  @@index([userId], map: "idx_order_active", where: "deleted_at IS NULL") // partial
}

enum OrderStatus { PENDING PROCESSING FULFILLED CANCELLED }
```

### SQLAlchemy (Python)
```python
from sqlalchemy import Column, BigInteger, String, Numeric, Boolean, DateTime, CheckConstraint, Index
from sqlalchemy.sql import func
from sqlalchemy.orm import DeclarativeBase

class Base(DeclarativeBase): pass

class Order(Base):
    __tablename__ = 'order'

    id         = Column(BigInteger, primary_key=True, autoincrement=True)
    user_id    = Column(BigInteger, ForeignKey('user.id'), nullable=False)
    status     = Column(String(20), nullable=False, default='pending')
    total      = Column(Numeric(19, 4), nullable=False)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())
    deleted_at = Column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        CheckConstraint("status IN ('pending','processing','fulfilled','cancelled')", name='chk_order_status'),
        Index('idx_order_user_id', 'user_id'),
        Index('idx_order_status_created_at', 'status', 'created_at'),
    )
```

### GORM (Go)
```go
type Order struct {
    ID        uint64          `gorm:"primaryKey;autoIncrement"`
    UserID    uint64          `gorm:"not null;index"`
    Status    string          `gorm:"type:varchar(20);not null;default:'pending';check:status IN ('pending','processing','fulfilled','cancelled')"`
    Total     decimal.Decimal `gorm:"type:decimal(19,4);not null"`
    CreatedAt time.Time       `gorm:"not null;autoCreateTime"`
    UpdatedAt time.Time       `gorm:"not null;autoUpdateTime"`
    DeletedAt gorm.DeletedAt  `gorm:"index"` // soft delete built-in
    Items     []OrderItem     `gorm:"foreignKey:OrderID"`
}

func (Order) TableName() string { return "order" }
```
