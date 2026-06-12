# Anti-Pattern Detection Guide

Anti-patterns are recurring bad solutions that seem reasonable but cause long-term damage.
This guide helps AI agents **detect them in real time** and fix them before they compound.

Each entry covers:
- **Detection signals** — what code smell triggers this
- **Damage** — what goes wrong if left unfixed
- **Fix** — concrete refactoring with before/after examples

---

## Table of Contents

1. [God Class](#1-god-class)
2. [Spaghetti Code](#2-spaghetti-code)
3. [Magic Numbers & Strings](#3-magic-numbers--strings)
4. [Dead Code](#4-dead-code)
5. [Feature Envy](#5-feature-envy)
6. [Shotgun Surgery](#6-shotgun-surgery)
7. [Primitive Obsession](#7-primitive-obsession)
8. [Long Parameter List](#8-long-parameter-list)
9. [Divergent Change](#9-divergent-change)
10. [Data Clumps](#10-data-clumps)
11. [Switch Statements on Type](#11-switch-statements-on-type)
12. [Parallel Inheritance Hierarchies](#12-parallel-inheritance-hierarchies)
13. [Lava Flow](#13-lava-flow)
14. [Golden Hammer](#14-golden-hammer)
15. [Premature Optimization](#15-premature-optimization)

---

## Detection Severity

| Tag | Meaning |
|-----|---------|
| `[ANTI-PATTERN: CRITICAL]` | Fix immediately — causes bugs or unmaintainability |
| `[ANTI-PATTERN: MAJOR]` | Fix this sprint — creates significant tech debt |
| `[ANTI-PATTERN: MINOR]` | Fix when touching this code — low immediate risk |

---

## 1. God Class

**Severity:** `CRITICAL`

**Detection signals:**
- Class has 10+ methods doing unrelated things
- Class name is vague: `Manager`, `Handler`, `Processor`, `Utils`, `Helper`, `Service` doing everything
- Class has 500+ lines
- Multiple developers constantly editing the same class for unrelated features

**Damage:** Every feature touches the same class → merge conflicts, untestable, impossible to reason about.

### Before (TypeScript)
```typescript
// [ANTI-PATTERN: CRITICAL — God Class]
// UserManager does auth + profile + billing + notifications + analytics
class UserManager {
  authenticate(credentials: Credentials) { ... }
  updateProfile(id: string, data: any) { ... }
  changePassword(id: string, password: string) { ... }
  chargeSubscription(userId: string, plan: string) { ... }
  refundPayment(paymentId: string) { ... }
  sendWelcomeEmail(user: User) { ... }
  sendPasswordResetEmail(email: string) { ... }
  trackLoginEvent(userId: string) { ... }
  generateUserReport(userId: string) { ... }
  deleteAccount(userId: string) { ... }
}
```

### After (TypeScript)
```typescript
// [FIX: SRP — split into focused services]
class AuthService {
  authenticate(credentials: Credentials): Promise<Session> { ... }
  changePassword(userId: string, password: string): Promise<void> { ... }
}

class UserProfileService {
  updateProfile(id: string, data: ProfileData): Promise<User> { ... }
  deleteAccount(id: string): Promise<void> { ... }
}

class BillingService {
  chargeSubscription(userId: string, plan: Plan): Promise<Payment> { ... }
  refund(paymentId: string): Promise<void> { ... }
}

class NotificationService {
  sendWelcomeEmail(user: User): Promise<void> { ... }
  sendPasswordReset(email: string): Promise<void> { ... }
}

class UserAnalyticsService {
  trackLogin(userId: string): void { ... }
  generateReport(userId: string): Promise<Report> { ... }
}
```

### Before (Python)
```python
# [ANTI-PATTERN: CRITICAL — God Class]
class OrderProcessor:
    def validate_order(self): ...
    def calculate_tax(self): ...
    def apply_discount(self): ...
    def charge_payment(self): ...
    def send_confirmation_email(self): ...
    def update_inventory(self): ...
    def generate_invoice(self): ...
    def log_audit_trail(self): ...
```

### After (Python)
```python
# [FIX: SRP]
class OrderValidator:
    def validate(self, order: Order) -> None: ...

class TaxCalculator:
    def calculate(self, order: Order) -> Decimal: ...

class PaymentProcessor:
    def charge(self, order: Order, method: PaymentMethod) -> Payment: ...

class InventoryService:
    def reserve(self, items: list[OrderItem]) -> None: ...
```

---

## 2. Spaghetti Code

**Severity:** `CRITICAL`

**Detection signals:**
- Functions longer than 50 lines
- Deeply nested if/else (3+ levels)
- Multiple `return` statements with no clear flow
- Goto-like patterns (break labels, exception abuse for flow control)
- No clear separation between input validation, business logic, and output

**Damage:** Impossible to test, debug, or extend. Every "fix" introduces new bugs.

### Before (TypeScript)
```typescript
// [ANTI-PATTERN: CRITICAL — Spaghetti Code — 4 levels deep, 60+ lines]
async function processOrder(req: Request) {
  if (req.body) {
    if (req.body.userId) {
      const user = await db.users.findOne(req.body.userId);
      if (user) {
        if (user.isActive) {
          if (req.body.items && req.body.items.length > 0) {
            let total = 0;
            for (const item of req.body.items) {
              if (item.inStock) {
                total += item.price * item.qty;
                if (user.isPremium) {
                  total = total * 0.9;
                }
              }
            }
            if (total > 0) {
              // payment, email, inventory... all here
            }
          }
        }
      }
    }
  }
}
```

### After (TypeScript)
```typescript
// [FIX: Extract functions, flatten nesting, early returns]
async function processOrder(req: Request): Promise<OrderResult> {
  const input = validateOrderInput(req.body);           // step 1: validate
  const user  = await fetchActiveUser(input.userId);    // step 2: fetch
  const total = calculateOrderTotal(input.items, user); // step 3: compute
  return await fulfillOrder(user, input.items, total);  // step 4: act
}

function validateOrderInput(body: unknown): OrderInput {
  if (!body || !isOrderInput(body)) throw new BadRequestError('Invalid input');
  return body;
}

async function fetchActiveUser(userId: string): Promise<User> {
  const user = await db.users.findOne(userId);
  if (!user?.isActive) throw new NotFoundError('Active user not found');
  return user;
}

function calculateOrderTotal(items: OrderItem[], user: User): number {
  const subtotal = items
    .filter(i => i.inStock)
    .reduce((sum, i) => sum + i.price * i.qty, 0);
  return user.isPremium ? subtotal * 0.9 : subtotal;
}
```

### After (Go)
```go
// [FIX: Spaghetti → pipeline of focused functions]
func processOrder(r *http.Request) (*OrderResult, error) {
    input, err := validateOrderInput(r)
    if err != nil { return nil, err }

    user, err := fetchActiveUser(input.UserID)
    if err != nil { return nil, err }

    total := calculateTotal(input.Items, user)
    return fulfillOrder(user, input.Items, total)
}
```

---

## 3. Magic Numbers & Strings

**Severity:** `MAJOR`

**Detection signals:**
- Numeric literals in logic: `if (retries > 3)`, `price * 0.18`, `timeout = 5000`
- String literals in conditions: `if (status === 'PENDING')`, `role === 'admin'`
- Same literal appears in 2+ places

**Damage:** Changes require hunting every occurrence. Intent is invisible.

### Before
```typescript
// [ANTI-PATTERN: MAJOR — Magic Numbers & Strings]
if (user.age >= 18) { ... }
setTimeout(retry, 5000);
const discounted = price * 0.85;
if (order.status === 'PENDING') { ... }
```

### After (TypeScript)
```typescript
// [FIX: DRY — named constants]
const MINIMUM_LEGAL_AGE  = 18;
const RETRY_DELAY_MS     = 5000;
const MEMBER_DISCOUNT    = 0.85;

enum OrderStatus { PENDING = 'PENDING', FULFILLED = 'FULFILLED', CANCELLED = 'CANCELLED' }

if (user.age >= MINIMUM_LEGAL_AGE) { ... }
setTimeout(retry, RETRY_DELAY_MS);
const discounted = price * MEMBER_DISCOUNT;
if (order.status === OrderStatus.PENDING) { ... }
```

### After (Python)
```python
# [FIX: constants module]
from enum import Enum

MINIMUM_LEGAL_AGE = 18
RETRY_DELAY_SECONDS = 5
MEMBER_DISCOUNT_RATE = 0.85

class OrderStatus(Enum):
    PENDING   = 'PENDING'
    FULFILLED = 'FULFILLED'
    CANCELLED = 'CANCELLED'
```

### After (Rust)
```rust
// [FIX: const + enum]
const MINIMUM_LEGAL_AGE: u32 = 18;
const RETRY_DELAY_MS: u64 = 5000;
const MEMBER_DISCOUNT: f64 = 0.85;

enum OrderStatus { Pending, Fulfilled, Cancelled }
```

### After (Go)
```go
// [FIX: constants + iota enum]
const (
    MinimumLegalAge  = 18
    RetryDelayMs     = 5000
    MemberDiscount   = 0.85
)

type OrderStatus string
const (
    StatusPending   OrderStatus = "PENDING"
    StatusFulfilled OrderStatus = "FULFILLED"
    StatusCancelled OrderStatus = "CANCELLED"
)
```

---

## 4. Dead Code

**Severity:** `MAJOR`

**Detection signals:**
- Functions/methods never called anywhere
- Variables assigned but never read
- `if (false)` or `if (DEBUG && false)` blocks
- Commented-out code blocks (3+ lines)
- Feature flags permanently set to `false`
- TODO comments older than one sprint

**Damage:** Cognitive load, misleads developers, creates false maintenance burden.

### Detection + Fix
```typescript
// [ANTI-PATTERN: MAJOR — Dead Code]
function legacyCalculate(x: number): number {  // never called
  return x * 1.05;
}

const DEBUG_MODE = false;
if (DEBUG_MODE) {
  console.log('This never runs');  // dead branch
}

// const result = oldProcess(data);  // commented for 6 months
// if (result.legacy) { ... }

// [FIX: YAGNI — delete all of the above]
// If needed again, git history has it.
```

```python
# [ANTI-PATTERN: MAJOR — Dead Code]
def _old_format_date(d):      # never used
    return d.strftime('%Y%m%d')

ENABLE_CACHE = False          # never toggled
if ENABLE_CACHE:
    result = cache.get(key)   # dead branch

# [FIX: delete; git history preserves it if ever needed]
```

---

## 5. Feature Envy

**Severity:** `MAJOR`

**Detection signals:**
- A method accesses data/methods of another class more than its own
- Method would make more sense living in the other class
- Pattern: `other.getX()`, `other.getY()`, `other.getZ()` in the same method

**Damage:** Wrong responsibility distribution — logic drifts away from the data it operates on.

### Before (TypeScript)
```typescript
// [ANTI-PATTERN: MAJOR — Feature Envy]
// OrderService is obsessed with Customer's data
class OrderService {
  calculateLoyaltyDiscount(order: Order, customer: Customer): number {
    // accesses customer 5 times — this logic belongs in Customer
    const years = customer.getMembershipYears();
    const tier  = customer.getLoyaltyTier();
    const points = customer.getLoyaltyPoints();
    const isVip  = customer.isVIP();
    const base   = isVip ? 0.2 : tier === 'gold' ? 0.1 : 0.05;
    return base + (points > 1000 ? 0.05 : 0);
  }
}
```

### After (TypeScript)
```typescript
// [FIX: Move Method — logic belongs where the data lives]
class Customer {
  calculateLoyaltyDiscount(): number {
    const base = this.isVIP() ? 0.2
               : this.loyaltyTier === 'gold' ? 0.1
               : 0.05;
    return base + (this.loyaltyPoints > 1000 ? 0.05 : 0);
  }
}

class OrderService {
  calculateDiscount(order: Order, customer: Customer): number {
    return customer.calculateLoyaltyDiscount(); // clean delegation
  }
}
```

---

## 6. Shotgun Surgery

**Severity:** `MAJOR`

**Detection signals:**
- One small change requires editing 5+ files
- Business rule is scattered across multiple classes/modules
- Adding a new payment method / status / role requires touching N unrelated files

**Damage:** High change amplification — one logical change = many physical changes = many bugs.

### Fix Pattern
```typescript
// [ANTI-PATTERN: MAJOR — Shotgun Surgery]
// Adding a new OrderStatus requires editing: OrderService, EmailService,
// InventoryService, AnalyticsService, ReportService — all have switch(status)

// [FIX: PATTERN: Observer or Strategy — centralize the variation point]
class OrderStatusHandler {
  private handlers = new Map<OrderStatus, StatusHandler[]>();

  register(status: OrderStatus, handler: StatusHandler) {
    const list = this.handlers.get(status) ?? [];
    this.handlers.set(status, [...list, handler]);
  }

  handle(order: Order, status: OrderStatus) {
    this.handlers.get(status)?.forEach(h => h.handle(order));
  }
}
// Now adding a new status = one registration, zero surgery
```

---

## 7. Primitive Obsession

**Severity:** `MAJOR`

**Detection signals:**
- Passing raw `string` for email, phone, currency, ID
- Using `number` for money calculations (floating point errors)
- `boolean` flags that really represent a state enum
- Coordinates as `(number, number)` instead of `Point`

**Damage:** No validation at boundaries, no semantic meaning, bugs from wrong types.

### Before
```typescript
// [ANTI-PATTERN: MAJOR — Primitive Obsession]
function createUser(email: string, age: number, currency: string, amount: number) { ... }
function transfer(fromAccount: string, toAccount: string, amount: number) { ... }
```

### After (TypeScript)
```typescript
// [FIX: Value Objects — wrap primitives with validation + meaning]
class Email {
  private constructor(private readonly value: string) {}
  static create(raw: string): Email {
    if (!raw.includes('@')) throw new Error('Invalid email');
    return new Email(raw.toLowerCase());
  }
  toString() { return this.value; }
}

class Money {
  private constructor(
    private readonly amount: bigint,  // cents — no float errors
    private readonly currency: string
  ) {}
  static of(amount: number, currency: string): Money {
    return new Money(BigInt(Math.round(amount * 100)), currency);
  }
  add(other: Money): Money {
    if (this.currency !== other.currency) throw new Error('Currency mismatch');
    return new Money(this.amount + other.amount, this.currency);
  }
}

function createUser(email: Email, age: number, balance: Money) { ... }
```

### After (Python)
```python
# [FIX: Value Objects using dataclass + validation]
from dataclasses import dataclass
from decimal import Decimal

@dataclass(frozen=True)
class Email:
    value: str
    def __post_init__(self):
        if '@' not in self.value:
            raise ValueError(f'Invalid email: {self.value}')

@dataclass(frozen=True)
class Money:
    amount: Decimal
    currency: str
    def __add__(self, other: 'Money') -> 'Money':
        if self.currency != other.currency:
            raise ValueError('Currency mismatch')
        return Money(self.amount + other.amount, self.currency)
```

---

## 8. Long Parameter List

**Severity:** `MAJOR`

**Detection signals:**
- Function with 5+ parameters
- Several parameters always passed together
- Boolean flag parameters (always a design smell)

**Damage:** Hard to call correctly, easy to swap args, impossible to extend.

### Before
```typescript
// [ANTI-PATTERN: MAJOR — Long Parameter List (7 params)]
function sendEmail(
  to: string, subject: string, body: string,
  cc: string[], bcc: string[], replyTo: string,
  isHtml: boolean
) { ... }
```

### After (TypeScript)
```typescript
// [FIX: PATTERN: Builder or Parameter Object]
interface EmailOptions {
  to: string;
  subject: string;
  body: string;
  cc?: string[];
  bcc?: string[];
  replyTo?: string;
  isHtml?: boolean;
}

function sendEmail(options: EmailOptions) { ... }

// OR Builder:
new EmailBuilder()
  .to('user@example.com')
  .subject('Hello')
  .body('<h1>Hi</h1>')
  .isHtml()
  .send();
```

### After (Java)
```java
// [FIX: Builder Pattern]
Email email = new Email.Builder()
    .to("user@example.com")
    .subject("Hello")
    .body("<h1>Hi</h1>")
    .html(true)
    .build();
```

---

## 9. Divergent Change

**Severity:** `MAJOR`

**Detection signals:**
- One class changes for multiple unrelated reasons
- "I need to change this class when we add a new report format AND when we change the DB schema"
- Opposite of Shotgun Surgery — one class, many change triggers

**Fix:** Split by axis of change — each class should have ONE axis of variation.

```typescript
// [ANTI-PATTERN: MAJOR — Divergent Change]
// ReportService changes when: DB schema changes, report format changes, new report type added
class ReportService {
  fetchFromDB(query: string) { ... }      // axis 1: data layer
  formatAsCSV(data: any[]) { ... }         // axis 2: formatting
  formatAsPDF(data: any[]) { ... }         // axis 2: formatting
  generateSalesReport() { ... }            // axis 3: business logic
  generateInventoryReport() { ... }        // axis 3: business logic
}

// [FIX: separate by axis of change]
class ReportRepository    { fetch(query: Query): Promise<Row[]> { ... } }
class ReportFormatter     { format(data: Row[], type: FormatType): Buffer { ... } }
class SalesReportService  { generate(): Promise<Report> { ... } }
```

---

## 10. Data Clumps

**Severity:** `MINOR`

**Detection signals:**
- Same 3+ fields appearing together in multiple method signatures
- `(street, city, state, zip)` passed everywhere separately
- `(startDate, endDate)` appearing in 5+ places

**Fix:** Group into a meaningful object.

```typescript
// [ANTI-PATTERN: MINOR — Data Clumps]
function validateAddress(street: string, city: string, state: string, zip: string) { ... }
function shipTo(street: string, city: string, state: string, zip: string) { ... }
function geocode(street: string, city: string, state: string, zip: string) { ... }

// [FIX: Value Object]
interface Address { street: string; city: string; state: string; zip: string; }

function validateAddress(address: Address) { ... }
function shipTo(address: Address) { ... }
function geocode(address: Address) { ... }
```

---

## 11. Switch Statements on Type

**Severity:** `MAJOR`

**Detection signals:**
- `switch(type)` or `if/else if` chain on an object's type tag
- Same switch repeated in multiple places
- Adding a new type requires editing multiple switch statements

**Fix:** Strategy or Polymorphism — behavior moves into the type itself.

```typescript
// [ANTI-PATTERN: MAJOR — Switch on type, duplicated in 3 places]
function getDiscount(type: string, price: number): number {
  switch(type) {
    case 'premium': return price * 0.2;
    case 'student': return price * 0.1;
    case 'staff':   return price * 0.3;
    default:        return 0;
  }
}

// [FIX: PATTERN: Strategy — adding new type = new class, zero edits]
interface DiscountStrategy { calculate(price: number): number; }

class PremiumDiscount implements DiscountStrategy { calculate(p: number) { return p * 0.2; } }
class StudentDiscount implements DiscountStrategy { calculate(p: number) { return p * 0.1; } }
class StaffDiscount   implements DiscountStrategy { calculate(p: number) { return p * 0.3; } }
class NoDiscount      implements DiscountStrategy { calculate(p: number) { return 0; } }
```

---

## 12. Parallel Inheritance Hierarchies

**Severity:** `MAJOR`

**Detection signals:**
- Every time you add a subclass to hierarchy A, you must add a matching subclass to hierarchy B
- Two class trees with mirrored structures: `Animal/Dog/Cat` + `AnimalSound/DogSound/CatSound`

**Fix:** Merge hierarchies or use composition.

```typescript
// [ANTI-PATTERN: MAJOR — Parallel Hierarchies]
class Shape { }
class Circle extends Shape { }
class Square extends Shape { }

class ShapeRenderer { }
class CircleRenderer extends ShapeRenderer { render(c: Circle) { } }
class SquareRenderer extends ShapeRenderer { render(s: Square) { } }

// [FIX: PATTERN: Bridge — decouple shape from rendering]
interface Renderer { render(shape: Shape): void; }

class Circle extends Shape {
  draw(renderer: Renderer) { renderer.render(this); }
}
```

---

## 13. Lava Flow

**Severity:** `MAJOR`

**Detection signals:**
- Code marked `// DO NOT TOUCH` with no explanation
- Variables/classes no one understands but everyone is afraid to delete
- Legacy code wrapped in `try/catch` and ignored
- Architecture decisions made years ago that "just work" — nobody knows why

**Damage:** Untouchable code = unmaintainable system.

**Fix:**
```typescript
// [ANTI-PATTERN: MAJOR — Lava Flow]
// DO NOT TOUCH — legacy payment hack from 2019, breaks if removed
function legacyRecalculate(x: any): any {
  return x * 1.0000001; // magic adjustment
}

// [FIX: Investigate, document, or delete]
// Step 1: Add test coverage to understand behavior
// Step 2: Document WHY it exists with a link to the ticket/decision
// Step 3: If no test can be written and no reason found — it's dead code, delete it
```

---

## 14. Golden Hammer

**Severity:** `MINOR`

**Detection signals:**
- Same tool/pattern used for everything regardless of fit
- "We use microservices for everything" (including a 2-person startup CRUD app)
- "All state goes in Redux" (including local UI toggle state)
- "We use message queues for everything" (including synchronous user-facing requests)

**Damage:** Over-engineered solutions, wrong tool for the job.

**Fix:** Match tool to problem size. YAGNI applies to architecture too.

```
// [ANTI-PATTERN: MINOR — Golden Hammer]
// Using full event sourcing + CQRS for a blog with 10 users
// [YAGNI] — a simple CRUD repo is the right tool here
// Re-evaluate architecture at 10,000 users, not before
```

---

## 15. Premature Optimization

**Severity:** `MINOR`

**Detection signals:**
- Caching added before profiling shows it's needed
- Manual memory management where GC would suffice
- Bit manipulation where readability matters more
- "I'm optimizing for scale we don't have yet"

**Damage:** Complex code for no measurable gain. Violates YAGNI.

**Fix:**
```typescript
// [ANTI-PATTERN: MINOR — Premature Optimization]
// Manually pooling objects before any profiling
const pool: User[] = new Array(1000).fill(null).map(() => new User());
let poolIndex = 0;
function getUser(): User { return pool[poolIndex++ % 1000]; }

// [YAGNI] — write the simple version first:
function getUser(): User { return new User(); }
// Profile → only optimize if getUser() shows in profiler hotspots
```

---

## Anti-Pattern Quick Scan

Run this before every code review:

```
ANTI-PATTERN SCAN
═════════════════
[ ] God Class       — class doing 3+ unrelated things?
[ ] Spaghetti       — nesting > 3 levels deep? Function > 50 lines?
[ ] Magic Values    — unexplained literals in logic?
[ ] Dead Code       — commented blocks, unreachable branches, unused functions?
[ ] Feature Envy    — method more interested in another class's data?
[ ] Shotgun Surgery — one change requires editing 5+ files?
[ ] Primitive Obsess— raw strings/numbers where value objects belong?
[ ] Long Params     — function with 5+ parameters?
[ ] Switch on Type  — if/else chain or switch that'll need editing for new types?
[ ] Premature Optim — complexity added before profiling confirmed the need?

Found issues? Tag with [ANTI-PATTERN: CRITICAL/MAJOR/MINOR] and apply the fix.
```
