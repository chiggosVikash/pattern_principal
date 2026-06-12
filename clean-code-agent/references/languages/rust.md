# Rust — Language-Specific Clean Code Guide

Rust enforces correctness at compile time. Work with the borrow checker, not against it.

---

## 1. Ownership — Design Around It

```rust
// [ANTI-PATTERN: Cloning everything to avoid borrow errors]
fn process(data: Vec<Record>) -> Vec<Result> {
    let copy = data.clone(); // unnecessary clone — fight-the-compiler smell
    data.iter().map(|r| process_record(r)).collect()
}

// [FIX: Borrow correctly — pass references when ownership not needed]
fn process(data: &[Record]) -> Vec<Result> {  // borrow a slice, don't own
    data.iter().map(|r| process_record(r)).collect()
}

// [FIX: Return owned data when caller needs to own it]
fn load_records(path: &str) -> Vec<Record> {  // caller owns the result
    std::fs::read_to_string(path)
        .unwrap_or_default()
        .lines()
        .map(Record::parse)
        .collect()
}
```

---

## 2. Error Handling — Result & ? Operator

```rust
// [ANTI-PATTERN: .unwrap() in production code — panics on error]
let file = File::open("config.toml").unwrap();
let user = db.find_user(id).unwrap();

// [ANTI-PATTERN: .expect() everywhere — slightly better but still panics]
let config = parse_config().expect("config must be valid");

// [FIX: Propagate with ? operator]
fn load_config(path: &str) -> Result<Config, ConfigError> {
    let content = fs::read_to_string(path)?;  // ? propagates the error
    let config: Config = toml::from_str(&content)?;
    Ok(config)
}

// [FIX: Domain error enum — thiserror for ergonomic errors]
use thiserror::Error;

#[derive(Debug, Error)]
enum AppError {
    #[error("not found: {0}")]
    NotFound(String),
    #[error("database error: {0}")]
    Database(#[from] sqlx::Error),
    #[error("validation error on field '{field}': {message}")]
    Validation { field: String, message: String },
}

// [FIX: anyhow for application code where error type flexibility matters]
use anyhow::{Context, Result};

fn process() -> Result<()> {
    let config = load_config("app.toml")
        .context("failed to load application config")?;
    // ...
    Ok(())
}
```

---

## 3. Traits — Abstraction & Polymorphism

```rust
// [FIX: Trait for DIP — depend on behaviour, not concrete type]
trait Repository<T, ID> {
    fn find_by_id(&self, id: ID) -> Result<Option<T>, AppError>;
    fn save(&self, entity: &T) -> Result<T, AppError>;
    fn delete(&self, id: ID) -> Result<(), AppError>;
}

struct PostgresUserRepo { pool: PgPool }

impl Repository<User, UserId> for PostgresUserRepo {
    fn find_by_id(&self, id: UserId) -> Result<Option<User>, AppError> { ... }
    fn save(&self, user: &User) -> Result<User, AppError> { ... }
    fn delete(&self, id: UserId) -> Result<(), AppError> { ... }
}

// [FIX: Inject via generic — zero-cost abstraction]
struct UserService<R: Repository<User, UserId>> {
    repo: R,
}

impl<R: Repository<User, UserId>> UserService<R> {
    fn new(repo: R) -> Self { Self { repo } }
    fn get_user(&self, id: UserId) -> Result<User, AppError> {
        self.repo.find_by_id(id)?.ok_or(AppError::NotFound(id.to_string()))
    }
}

// [FIX: Trait objects (dyn) when you need runtime polymorphism]
struct UserService {
    repo: Box<dyn Repository<User, UserId>>,
}
```

---

## 4. Enums — Model States Exhaustively

```rust
// [FIX: Enums for state machines — illegal states unrepresentable]
enum OrderStatus {
    Pending { created_at: DateTime<Utc> },
    Processing { started_at: DateTime<Utc>, worker_id: WorkerId },
    Fulfilled { fulfilled_at: DateTime<Utc>, tracking_id: String },
    Cancelled { cancelled_at: DateTime<Utc>, reason: String },
}

// Exhaustive match — compiler catches missing arms
fn describe(status: &OrderStatus) -> String {
    match status {
        OrderStatus::Pending { created_at } =>
            format!("Pending since {}", created_at),
        OrderStatus::Processing { worker_id, .. } =>
            format!("Processing by worker {}", worker_id),
        OrderStatus::Fulfilled { tracking_id, .. } =>
            format!("Shipped: {}", tracking_id),
        OrderStatus::Cancelled { reason, .. } =>
            format!("Cancelled: {}", reason),
    }
}

// [FIX: Builder pattern with type-state — invalid construction is a compile error]
struct Order<S> { id: OrderId, state: S }
struct PendingState;
struct FulfilledState { tracking_id: String }

impl Order<PendingState> {
    fn new(id: OrderId) -> Self { Order { id, state: PendingState } }
    fn fulfill(self, tracking_id: String) -> Order<FulfilledState> {
        Order { id: self.id, state: FulfilledState { tracking_id } }
    }
}
// Order<PendingState>.tracking_id doesn't exist — compile error if you try
```

---

## 5. Iterators — Zero-Cost Abstractions

```rust
// [ANTI-PATTERN: Manual loop accumulation]
let mut result = Vec::new();
for user in &users {
    if user.is_active {
        result.push(user.name.to_uppercase());
    }
}

// [FIX: Iterator chain — same performance, more readable]
let result: Vec<String> = users.iter()
    .filter(|u| u.is_active)
    .map(|u| u.name.to_uppercase())
    .collect();

// [FIX: Custom iterator for domain types]
struct PagedUsers { page: usize, page_size: usize }

impl Iterator for PagedUsers {
    type Item = Result<Vec<User>, AppError>;
    fn next(&mut self) -> Option<Self::Item> {
        let users = fetch_page(self.page, self.page_size);
        match users {
            Ok(ref u) if u.is_empty() => None,
            result => { self.page += 1; Some(result) }
        }
    }
}
```

---

## 6. Newtype Pattern — Semantic Types

```rust
// [ANTI-PATTERN: Primitive Obsession]
fn transfer(from_account: String, to_account: String, amount: f64) { ... }
transfer(to_id, from_id, -50.0); // wrong order, negative amount — compiles!

// [FIX: Newtype Pattern — compile-time safety]
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
struct AccountId(String);

#[derive(Debug, Clone, Copy, PartialEq, PartialOrd)]
struct Money(u64); // cents — no floating point errors

impl Money {
    fn new(cents: u64) -> Self { Money(cents) }
    fn from_dollars(dollars: f64) -> Self {
        Money((dollars * 100.0).round() as u64)
    }
}

fn transfer(from: AccountId, to: AccountId, amount: Money) -> Result<(), AppError> {
    if from == to { return Err(AppError::SameAccount); }
    // ...
}
```

---

## 7. Async Rust

```rust
// [ANTI-PATTERN: Blocking in async context]
async fn get_user(id: UserId) -> Result<User, AppError> {
    let data = std::fs::read_to_string("users.json")?; // BLOCKS the thread!
    ...
}

// [FIX: Use async I/O]
async fn get_user(id: UserId) -> Result<User, AppError> {
    let data = tokio::fs::read_to_string("users.json").await?; // async I/O
    ...
}

// [FIX: Concurrent async tasks — like Promise.all]
async fn load_dashboard(user_id: UserId) -> Result<Dashboard, AppError> {
    let (user, orders, reviews) = tokio::try_join!(
        fetch_user(user_id),
        fetch_orders(user_id),
        fetch_reviews(user_id),
    )?;
    Ok(Dashboard { user, orders, reviews })
}
```

---

## Rust Quick Checklist

```
[ ] No .unwrap() or .expect() in production paths — use ?
[ ] Domain error enum with thiserror — no String errors
[ ] Traits for all abstractions — no direct struct coupling (DIP)
[ ] Enums for state machines — exhaustive match on all variants
[ ] Newtype pattern for domain IDs — no raw String/u64
[ ] Iterator chains over manual loops
[ ] Async I/O only — no blocking calls in async fns
[ ] No unnecessary .clone() — fix borrow errors correctly
```
