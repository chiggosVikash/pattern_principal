# SOLID Principles Checklist

Run this checklist against every class or module before finalizing code.
For each violation found, apply the fix shown and annotate with a Decision Comment.

---

## S — Single Responsibility Principle (SRP)

> A class should have only one reason to change.

### Checklist
- [ ] Does this class do exactly one thing?
- [ ] Can you name the class with a single, focused noun? (e.g., `UserRepository`, `InvoiceFormatter`)
- [ ] If it changed, would only ONE stakeholder care?

### Violation Signal
```
// ❌ VIOLATION: SRP — UserService does auth + profile update + email sending
class UserService {
  authenticate(credentials) { ... }
  updateProfile(data) { ... }
  sendWelcomeEmail(user) { ... }  // ← belongs in EmailService
  saveToDatabase(user) { ... }    // ← belongs in UserRepository
}
```

### Fix (TypeScript)
```typescript
// ✅ [SOLID: SRP] — each class has one reason to change
class AuthService       { authenticate(credentials: Credentials): User { ... } }
class UserProfileService { updateProfile(id: string, data: ProfileData): void { ... } }
class UserRepository    { save(user: User): void { ... } }
class EmailService      { sendWelcomeEmail(user: User): void { ... } }
```

### Fix (Python)
```python
# ✅ [SOLID: SRP]
class AuthService:
    def authenticate(self, credentials: Credentials) -> User: ...

class UserRepository:
    def save(self, user: User) -> None: ...

class EmailService:
    def send_welcome_email(self, user: User) -> None: ...
```

### Fix (Go)
```go
// ✅ [SOLID: SRP]
type AuthService struct{}
func (a AuthService) Authenticate(c Credentials) (User, error) { ... }

type UserRepository struct{}
func (r UserRepository) Save(u User) error { ... }
```

---

## O — Open/Closed Principle (OCP)

> Open for extension, closed for modification.

### Checklist
- [ ] Can I add a new feature/type WITHOUT editing the existing class?
- [ ] Are conditionals on type (`if type == X`) in core logic? → Red flag
- [ ] Are extension points defined via interfaces or abstract classes?

### Violation Signal
```
// ❌ VIOLATION: OCP — adding a new report type requires editing this class
class ReportExporter {
  export(report: Report, format: string) {
    if (format === 'pdf') { ... }
    else if (format === 'csv') { ... }
    // adding 'xlsx' means editing this file ← violation
  }
}
```

### Fix (TypeScript)
```typescript
// ✅ [SOLID: OCP] — new formats extend without touching ReportExporter
interface ExportStrategy {
  export(report: Report): Buffer;
}

class PDFExporter implements ExportStrategy { export(r: Report) { ... } }
class CSVExporter implements ExportStrategy { export(r: Report) { ... } }
class XLSXExporter implements ExportStrategy { export(r: Report) { ... } } // new — no edits needed

class ReportExporter {
  constructor(private strategy: ExportStrategy) {}
  export(report: Report) { return this.strategy.export(report); }
}
```

### Fix (Rust)
```rust
// ✅ [SOLID: OCP]
trait ExportStrategy { fn export(&self, report: &Report) -> Vec<u8>; }

struct PDFExporter;
struct CSVExporter;

impl ExportStrategy for PDFExporter { fn export(&self, r: &Report) -> Vec<u8> { vec![] } }
impl ExportStrategy for CSVExporter { fn export(&self, r: &Report) -> Vec<u8> { vec![] } }
```

---

## L — Liskov Substitution Principle (LSP)

> Subtypes must be substitutable for their base types without breaking the program.

### Checklist
- [ ] Does every subclass honor the parent's contract (preconditions, postconditions)?
- [ ] Does any subclass throw exceptions the parent doesn't declare?
- [ ] Does any subclass return null/empty where the parent guarantees a value?
- [ ] Does the subclass make sense in every context where the parent is used?

### Violation Signal
```
// ❌ VIOLATION: LSP — Square breaks Rectangle's contract
class Rectangle {
  setWidth(w: number)  { this.width = w; }
  setHeight(h: number) { this.height = h; }
  area() { return this.width * this.height; }
}

class Square extends Rectangle {
  setWidth(w: number)  { this.width = w; this.height = w; }  // breaks contract!
  setHeight(h: number) { this.width = h; this.height = h; }  // breaks contract!
}
```

### Fix (TypeScript)
```typescript
// ✅ [SOLID: LSP] — use composition or separate abstractions
interface Shape { area(): number; }

class Rectangle implements Shape {
  constructor(private width: number, private height: number) {}
  area() { return this.width * this.height; }
}

class Square implements Shape {
  constructor(private side: number) {}
  area() { return this.side * this.side; }
}
```

### Fix (Java)
```java
// ✅ [SOLID: LSP]
interface Shape { double area(); }

class Rectangle implements Shape {
    private double width, height;
    Rectangle(double w, double h) { width = w; height = h; }
    public double area() { return width * height; }
}
class Square implements Shape {
    private double side;
    Square(double s) { side = s; }
    public double area() { return side * side; }
}
```

---

## I — Interface Segregation Principle (ISP)

> Clients should not be forced to depend on interfaces they do not use.

### Checklist
- [ ] Does any class implement an interface method with an empty body or a `throw NotImplemented`?
- [ ] Does the interface have more than ~5 methods? Consider splitting.
- [ ] Is the interface serving multiple different client types?

### Violation Signal
```
// ❌ VIOLATION: ISP — Animal interface forces Fish to implement walk()
interface Animal {
  eat(): void;
  walk(): void;   // Fish can't walk
  swim(): void;   // Dog can't swim
  fly(): void;    // most animals can't fly
}
```

### Fix (TypeScript)
```typescript
// ✅ [SOLID: ISP] — focused interfaces; classes implement only what they need
interface CanEat   { eat(): void; }
interface CanWalk  { walk(): void; }
interface CanSwim  { swim(): void; }
interface CanFly   { fly(): void; }

class Dog  implements CanEat, CanWalk { eat() {} walk() {} }
class Fish implements CanEat, CanSwim { eat() {} swim() {} }
class Bird implements CanEat, CanFly  { eat() {} fly() {} }
```

### Fix (Dart)
```dart
// ✅ [SOLID: ISP]
abstract class CanEat  { void eat(); }
abstract class CanSwim { void swim(); }
abstract class CanFly  { void fly(); }

class Fish  implements CanEat, CanSwim { void eat(){} void swim(){} }
class Eagle implements CanEat, CanFly  { void eat(){} void fly(){} }
```

---

## D — Dependency Inversion Principle (DIP)

> High-level modules should not depend on low-level modules. Both should depend on abstractions.

### Checklist
- [ ] Does business logic contain `new ConcreteService()`? → Red flag
- [ ] Are dependencies injected via constructor or method parameters?
- [ ] Does the class depend on an interface/abstract class, NOT a concrete implementation?

### Violation Signal
```
// ❌ VIOLATION: DIP — OrderService directly depends on MySQLOrderRepository
class OrderService {
  private repo = new MySQLOrderRepository(); // ← hardcoded concrete dependency
  placeOrder(order: Order) { this.repo.save(order); }
}
```

### Fix (TypeScript)
```typescript
// ✅ [SOLID: DIP] — OrderService depends on abstraction; concrete injected from outside
interface OrderRepository {
  save(order: Order): Promise<void>;
  findById(id: string): Promise<Order | null>;
}

class OrderService {
  constructor(private repo: OrderRepository) {} // ← injected abstraction

  async placeOrder(order: Order) {
    await this.repo.save(order);
  }
}

// Wired up in composition root / DI container:
const service = new OrderService(new MySQLOrderRepository());
// OR in tests:
const service = new OrderService(new MockOrderRepository());
```

### Fix (Python)
```python
# ✅ [SOLID: DIP]
from abc import ABC, abstractmethod

class OrderRepository(ABC):
    @abstractmethod
    def save(self, order: Order) -> None: ...

class OrderService:
    def __init__(self, repo: OrderRepository):  # injected abstraction
        self.repo = repo

    def place_order(self, order: Order) -> None:
        self.repo.save(order)
```

### Fix (C++)
```cpp
// ✅ [SOLID: DIP]
class OrderRepository {
public:
    virtual void save(const Order& order) = 0;
    virtual ~OrderRepository() = default;
};

class OrderService {
public:
    explicit OrderService(std::shared_ptr<OrderRepository> repo) : repo_(repo) {}
    void placeOrder(const Order& order) { repo_->save(order); }
private:
    std::shared_ptr<OrderRepository> repo_;
};
```

---

## Full SOLID Audit Checklist

Run before every PR / code completion:

```
SOLID AUDIT
===========
Class/Module: ________________

[ ] SRP  — Has exactly one reason to change
[ ] OCP  — New behavior added via extension, not modification
[ ] LSP  — All subclasses safely substitute their base type
[ ] ISP  — No class implements unused interface methods
[ ] DIP  — Dependencies injected as abstractions, no `new` in business logic

Violations found: ____________
Fix applied:      ____________
Decision comment added: [ ] Yes  [ ] N/A
```
