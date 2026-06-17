# Migration Patterns

Safe, reversible, zero-downtime database migrations for production systems.

---

## The Golden Rules

1. **Always write a DOWN migration** — every UP must be reversible
2. **Additive changes first, destructive changes last** — in separate deploys
3. **Never DROP in the same migration as data changes**
4. **Deploy app changes BEFORE schema changes that remove columns**
5. **Deploy schema changes BEFORE app changes that require new columns**
6. **Index creation on large tables: always CONCURRENTLY**
7. **Test migrations on a production-size database** — 1M rows behaves differently from 1K

---

## 1. Adding a Column Safely

### Simple Case — Nullable Column
```sql
-- [MIGRATION: zero-downtime — additive, no lock]
-- UP
ALTER TABLE "order" ADD COLUMN notes TEXT;
-- Nullable column = instant, no table rewrite, no lock

-- DOWN
ALTER TABLE "order" DROP COLUMN notes;
```

### Adding NOT NULL Column (the safe 3-step process)
```sql
-- [MIGRATION: zero-downtime NOT NULL — 3 steps across 2 deploys]

-- STEP 1 (Deploy 1): add as nullable
ALTER TABLE "user" ADD COLUMN phone VARCHAR(20);

-- STEP 2 (Deploy 1, after step 1): backfill existing rows
UPDATE "user" SET phone = '' WHERE phone IS NULL;
-- For large tables, backfill in batches to avoid lock:
DO $$
DECLARE batch_size INT := 10000;
BEGIN
    LOOP
        UPDATE "user" SET phone = ''
        WHERE phone IS NULL
          AND id IN (SELECT id FROM "user" WHERE phone IS NULL LIMIT batch_size);
        EXIT WHEN NOT FOUND;
        PERFORM pg_sleep(0.1); -- brief pause between batches
    END LOOP;
END $$;

-- STEP 3 (Deploy 2): add NOT NULL constraint after all rows are filled
ALTER TABLE "user" ALTER COLUMN phone SET NOT NULL;
ALTER TABLE "user" ALTER COLUMN phone SET DEFAULT '';

-- DOWN (reverse order)
ALTER TABLE "user" ALTER COLUMN phone DROP NOT NULL;
ALTER TABLE "user" DROP COLUMN phone;
```

---

## 2. Renaming a Column (Zero-Downtime)

Direct rename breaks running app instances reading the old column name. Use the 4-step expand/contract pattern:

```sql
-- [MIGRATION: expand/contract — rename without downtime]

-- STEP 1 (Deploy 1): add new column
ALTER TABLE "user" ADD COLUMN full_name VARCHAR(255);

-- STEP 2 (Deploy 1): copy existing data
UPDATE "user" SET full_name = name WHERE full_name IS NULL;

-- STEP 3 (Deploy 1): create trigger to dual-write during transition
CREATE OR REPLACE FUNCTION sync_user_name() RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
        NEW.full_name := COALESCE(NEW.full_name, NEW.name);
        NEW.name      := COALESCE(NEW.name, NEW.full_name);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_sync_user_name
    BEFORE INSERT OR UPDATE ON "user"
    FOR EACH ROW EXECUTE FUNCTION sync_user_name();

-- Deploy 2: update app to read/write full_name instead of name

-- STEP 4 (Deploy 3): drop old column + trigger
DROP TRIGGER trg_sync_user_name ON "user";
DROP FUNCTION sync_user_name();
ALTER TABLE "user" DROP COLUMN name;
```

---

## 3. Dropping a Column Safely

```sql
-- [MIGRATION: zero-downtime column drop — 2 deploys]

-- Deploy 1: remove all references to column from application code
-- (app must not SELECT, INSERT, or UPDATE this column)
-- Deploy + verify no errors in logs

-- Deploy 2: drop the column
-- UP
ALTER TABLE "order" DROP COLUMN legacy_reference_code;

-- DOWN (can only restore if you have a backup — document this)
-- ALTER TABLE "order" ADD COLUMN legacy_reference_code VARCHAR(50);
-- Note: data is gone — restore from backup if needed

-- [RULE] Never drop a column in the same deploy as removing it from app code
-- Running app instances still have old code during rolling deploy
```

---

## 4. Changing a Column Type

```sql
-- [MIGRATION: type change — most require table rewrite]

-- Safe: widening VARCHAR
ALTER TABLE product ALTER COLUMN sku TYPE VARCHAR(100);  -- was VARCHAR(50)

-- Safe: INT to BIGINT (widening)
ALTER TABLE "order" ALTER COLUMN quantity TYPE BIGINT;

-- UNSAFE on large tables: any type change that requires data conversion
-- [FIX: add new column approach]

-- STEP 1: add new column with correct type
ALTER TABLE product ADD COLUMN price_cents BIGINT;

-- STEP 2: migrate data
UPDATE product SET price_cents = (price * 100)::BIGINT;

-- STEP 3: add NOT NULL after backfill
ALTER TABLE product ALTER COLUMN price_cents SET NOT NULL;

-- STEP 4: update app to use price_cents (separate deploy)

-- STEP 5: drop old column (after verifying app works)
ALTER TABLE product DROP COLUMN price;

-- STEP 6: rename if desired
ALTER TABLE product RENAME COLUMN price_cents TO price;
```

---

## 5. Adding Indexes Safely

```sql
-- [MIGRATION: index — always CONCURRENTLY on production]
-- CONCURRENTLY builds index without holding a write lock
-- Takes longer but never blocks app

-- UP
CREATE INDEX CONCURRENTLY idx_order_user_id ON "order"(user_id);

-- DOWN
DROP INDEX CONCURRENTLY idx_order_user_id;

-- [ANTI-PATTERN: without CONCURRENTLY on large table]
CREATE INDEX idx_order_user_id ON "order"(user_id);
-- ↑ Holds ACCESS SHARE lock — blocks writes on PostgreSQL < 12 during build
--   On tables with millions of rows, this can take minutes
```

---

## 6. Adding Foreign Keys Safely

```sql
-- [MIGRATION: FK — validate separately to avoid long lock]

-- STEP 1: add FK without validation (immediate, no lock)
ALTER TABLE order_item
    ADD CONSTRAINT fk_order_item_order
    FOREIGN KEY (order_id) REFERENCES "order"(id)
    NOT VALID;  -- skips validation of existing rows

-- STEP 2: validate existing rows separately (concurrent, no write lock)
ALTER TABLE order_item
    VALIDATE CONSTRAINT fk_order_item_order;

-- DOWN
ALTER TABLE order_item DROP CONSTRAINT fk_order_item_order;
```

---

## 7. Table Restructuring with Data Migration

```sql
-- [MIGRATION: split table — example: splitting user address into separate table]

-- UP
-- Step 1: create new table
CREATE TABLE user_address (
    id         BIGSERIAL   PRIMARY KEY,
    user_id    BIGINT      NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    street     VARCHAR(255),
    city       VARCHAR(100),
    state      VARCHAR(100),
    zip        VARCHAR(20),
    country    CHAR(2)     NOT NULL DEFAULT 'IN',
    is_primary BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_user_address_user_id ON user_address(user_id);

-- Step 2: migrate existing data
INSERT INTO user_address (user_id, street, city, state, zip, country)
SELECT id, address_street, address_city, address_state, address_zip, 'IN'
FROM "user"
WHERE address_street IS NOT NULL;

-- Step 3: verify count
-- SELECT COUNT(*) FROM user_address;
-- SELECT COUNT(*) FROM "user" WHERE address_street IS NOT NULL;

-- Step 4: (separate deploy) remove address columns from "user" table
-- ALTER TABLE "user"
--     DROP COLUMN address_street,
--     DROP COLUMN address_city,
--     DROP COLUMN address_state,
--     DROP COLUMN address_zip;

-- DOWN
DROP TABLE user_address;
```

---

## 8. Migration Versioning — Tool Examples

### Prisma
```typescript
// prisma/migrations/20240115_add_subscription_table/migration.sql
-- CreateTable
CREATE TABLE "subscription" (
    "id"         BIGSERIAL    NOT NULL,
    "user_id"    BIGINT       NOT NULL,
    "plan"       VARCHAR(20)  NOT NULL,
    "status"     VARCHAR(20)  NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "subscription_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE INDEX "idx_subscription_user_id" ON "subscription"("user_id");
-- AddForeignKey
ALTER TABLE "subscription"
    ADD CONSTRAINT "fk_subscription_user"
    FOREIGN KEY ("user_id") REFERENCES "user"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
```

### Alembic (Python)
```python
# alembic/versions/20240115_add_subscription.py
def upgrade() -> None:
    op.create_table('subscription',
        sa.Column('id', sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column('user_id', sa.BigInteger(), nullable=False),
        sa.Column('plan', sa.String(20), nullable=False),
        sa.Column('status', sa.String(20), nullable=False, server_default='active'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text('NOW()')),
        sa.ForeignKeyConstraint(['user_id'], ['user.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('idx_subscription_user_id', 'subscription', ['user_id'])

def downgrade() -> None:
    op.drop_index('idx_subscription_user_id')
    op.drop_table('subscription')
```

### golang-migrate
```sql
-- migrations/000012_add_subscription_table.up.sql
CREATE TABLE subscription (
    id         BIGSERIAL    PRIMARY KEY,
    user_id    BIGINT       NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    plan       VARCHAR(20)  NOT NULL,
    status     VARCHAR(20)  NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_subscription_user_id ON subscription(user_id);

-- migrations/000012_add_subscription_table.down.sql
DROP TABLE IF EXISTS subscription;
```

---

## Migration Checklist

```
BEFORE EVERY MIGRATION
═══════════════════════════════════
[ ] UP migration written and tested on dev
[ ] DOWN migration written and tested on dev
[ ] Tested on production-size dataset (or staging)
[ ] Breaking changes? → 2-deploy strategy planned
[ ] Large table index? → CONCURRENTLY used
[ ] FK added? → NOT VALID + VALIDATE CONSTRAINT used
[ ] NOT NULL column? → 3-step add/backfill/constrain used
[ ] Backup taken before running on production
[ ] Rollback plan documented
[ ] Estimated run time on prod data size known
```
