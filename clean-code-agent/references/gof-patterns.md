# GoF Design Patterns Reference

Top 10 patterns for everyday production code. Each entry covers:
- **When to use** — the signal that this pattern fits
- **When NOT to use** — common misapplication
- **Polyglot examples** — TypeScript, Python, Dart, Rust, Go, Java, C++

---

## Table of Contents

1. [Factory Method](#1-factory-method)
2. [Abstract Factory](#2-abstract-factory)
3. [Builder](#3-builder)
4. [Singleton](#4-singleton)
5. [Strategy](#5-strategy)
6. [Observer](#6-observer)
7. [Decorator](#7-decorator)
8. [Command](#8-command)
9. [Adapter](#9-adapter)
10. [Template Method](#10-template-method)

---

## 1. Factory Method

**Intent:** Define an interface for creating an object, but let subclasses decide which class to instantiate.

**Use when:**
- Object creation logic is complex or varies by context
- You want to decouple creation from usage
- You have `new ConcreteClass()` scattered across business logic

**Do NOT use when:** You only ever create one type — a simple constructor is fine.

### TypeScript
```typescript
// [PATTERN: Factory Method] — creation varies by notification type
interface Notifier {
  send(message: string): void;
}

class EmailNotifier implements Notifier {
  send(message: string) { console.log(`Email: ${message}`); }
}

class SMSNotifier implements Notifier {
  send(message: string) { console.log(`SMS: ${message}`); }
}

function createNotifier(type: 'email' | 'sms'): Notifier {
  if (type === 'email') return new EmailNotifier();
  return new SMSNotifier();
}
```

### Python
```python
# [PATTERN: Factory Method]
from abc import ABC, abstractmethod

class Notifier(ABC):
    @abstractmethod
    def send(self, message: str) -> None: ...

class EmailNotifier(Notifier):
    def send(self, message: str) -> None:
        print(f"Email: {message}")

class SMSNotifier(Notifier):
    def send(self, message: str) -> None:
        print(f"SMS: {message}")

def create_notifier(type_: str) -> Notifier:
    return {"email": EmailNotifier, "sms": SMSNotifier}[type_]()
```

### Dart
```dart
// [PATTERN: Factory Method]
abstract class Notifier {
  void send(String message);
  factory Notifier.create(String type) {
    return type == 'email' ? EmailNotifier() : SMSNotifier();
  }
}
class EmailNotifier implements Notifier {
  void send(String message) => print('Email: $message');
}
class SMSNotifier implements Notifier {
  void send(String message) => print('SMS: $message');
}
```

### Rust
```rust
// [PATTERN: Factory Method]
trait Notifier { fn send(&self, message: &str); }

struct EmailNotifier;
struct SMSNotifier;

impl Notifier for EmailNotifier {
    fn send(&self, message: &str) { println!("Email: {}", message); }
}
impl Notifier for SMSNotifier {
    fn send(&self, message: &str) { println!("SMS: {}", message); }
}

fn create_notifier(kind: &str) -> Box<dyn Notifier> {
    match kind {
        "email" => Box::new(EmailNotifier),
        _ => Box::new(SMSNotifier),
    }
}
```

### Go
```go
// [PATTERN: Factory Method]
type Notifier interface { Send(message string) }

type EmailNotifier struct{}
type SMSNotifier struct{}

func (e EmailNotifier) Send(m string) { fmt.Println("Email:", m) }
func (s SMSNotifier) Send(m string)  { fmt.Println("SMS:", m) }

func CreateNotifier(kind string) Notifier {
    if kind == "email" { return EmailNotifier{} }
    return SMSNotifier{}
}
```

### Java
```java
// [PATTERN: Factory Method]
interface Notifier { void send(String message); }

class EmailNotifier implements Notifier {
    public void send(String message) { System.out.println("Email: " + message); }
}
class SMSNotifier implements Notifier {
    public void send(String message) { System.out.println("SMS: " + message); }
}

class NotifierFactory {
    public static Notifier create(String type) {
        return switch (type) {
            case "email" -> new EmailNotifier();
            default -> new SMSNotifier();
        };
    }
}
```

### C++
```cpp
// [PATTERN: Factory Method]
class Notifier { public: virtual void send(const std::string& msg) = 0; };

class EmailNotifier : public Notifier {
public: void send(const std::string& msg) override { std::cout << "Email: " << msg; }
};
class SMSNotifier : public Notifier {
public: void send(const std::string& msg) override { std::cout << "SMS: " << msg; }
};

std::unique_ptr<Notifier> createNotifier(const std::string& type) {
    if (type == "email") return std::make_unique<EmailNotifier>();
    return std::make_unique<SMSNotifier>();
}
```

---

## 2. Abstract Factory

**Intent:** Create families of related objects without specifying concrete classes.

**Use when:** You need to swap entire families of objects (e.g., UI theme, DB provider, payment gateway set).

**Do NOT use when:** You only have one product type — use Factory Method instead.

### TypeScript
```typescript
// [PATTERN: Abstract Factory] — swap entire payment provider family
interface PaymentGateway { charge(amount: number): void; }
interface WebhookHandler { handle(event: object): void; }

interface PaymentFactory {
  createGateway(): PaymentGateway;
  createWebhookHandler(): WebhookHandler;
}

class StripeFactory implements PaymentFactory {
  createGateway() { return new StripeGateway(); }
  createWebhookHandler() { return new StripeWebhookHandler(); }
}

class RazorpayFactory implements PaymentFactory {
  createGateway() { return new RazorpayGateway(); }
  createWebhookHandler() { return new RazorpayWebhookHandler(); }
}
```

---

## 3. Builder

**Intent:** Construct complex objects step by step.

**Use when:** Object has many optional parameters; constructor with 6+ args is a smell.

**Do NOT use when:** The object is simple with 1-3 required fields.

### TypeScript
```typescript
// [PATTERN: Builder] — avoids constructor with 8 optional params
class QueryBuilder {
  private table = '';
  private conditions: string[] = [];
  private limitVal?: number;

  from(table: string): this { this.table = table; return this; }
  where(condition: string): this { this.conditions.push(condition); return this; }
  limit(n: number): this { this.limitVal = n; return this; }

  build(): string {
    let q = `SELECT * FROM ${this.table}`;
    if (this.conditions.length) q += ` WHERE ${this.conditions.join(' AND ')}`;
    if (this.limitVal) q += ` LIMIT ${this.limitVal}`;
    return q;
  }
}

// Usage
const query = new QueryBuilder().from('users').where('active = true').limit(10).build();
```

### Python
```python
# [PATTERN: Builder]
from dataclasses import dataclass, field
from typing import Optional

@dataclass
class QueryBuilder:
    table: str = ''
    conditions: list[str] = field(default_factory=list)
    limit_val: Optional[int] = None

    def from_table(self, table: str) -> 'QueryBuilder':
        self.table = table; return self

    def where(self, condition: str) -> 'QueryBuilder':
        self.conditions.append(condition); return self

    def limit(self, n: int) -> 'QueryBuilder':
        self.limit_val = n; return self

    def build(self) -> str:
        q = f"SELECT * FROM {self.table}"
        if self.conditions: q += f" WHERE {' AND '.join(self.conditions)}"
        if self.limit_val: q += f" LIMIT {self.limit_val}"
        return q
```

---

## 4. Singleton

**Intent:** Ensure a class has only one instance and provide global access.

**Use when:** Shared resources like config, logger, connection pool.

**⚠️ YAGNI Warning:** Often overused. Prefer dependency injection over Singleton for testability.

### TypeScript
```typescript
// [PATTERN: Singleton] — one config instance across app
// [YAGNI-WARN] — consider DI container if tests need different configs
class AppConfig {
  private static instance: AppConfig;
  private constructor(public readonly dbUrl: string) {}

  static getInstance(): AppConfig {
    if (!AppConfig.instance) {
      AppConfig.instance = new AppConfig(process.env.DB_URL!);
    }
    return AppConfig.instance;
  }
}
```

---

## 5. Strategy

**Intent:** Define a family of algorithms, encapsulate each one, make them interchangeable.

**Use when:**
- Long if/else or switch statements on behavior type
- Behavior that needs to be swappable at runtime

**Do NOT use when:** There are only 2 strategies and they'll never change — keep it simple.

### TypeScript
```typescript
// [PATTERN: Strategy] — avoids if/else chain on discount type
interface DiscountStrategy {
  calculate(price: number): number;
}

class NoDiscount implements DiscountStrategy {
  calculate(price: number) { return price; }
}
class PercentageDiscount implements DiscountStrategy {
  constructor(private percent: number) {}
  calculate(price: number) { return price * (1 - this.percent / 100); }
}
class FlatDiscount implements DiscountStrategy {
  constructor(private amount: number) {}
  calculate(price: number) { return price - this.amount; }
}

class PricingEngine {
  constructor(private strategy: DiscountStrategy) {}
  getPrice(price: number) { return this.strategy.calculate(price); }
}
```

### Python
```python
# [PATTERN: Strategy]
from abc import ABC, abstractmethod

class DiscountStrategy(ABC):
    @abstractmethod
    def calculate(self, price: float) -> float: ...

class NoDiscount(DiscountStrategy):
    def calculate(self, price: float) -> float: return price

class PercentageDiscount(DiscountStrategy):
    def __init__(self, percent: float): self.percent = percent
    def calculate(self, price: float) -> float:
        return price * (1 - self.percent / 100)

class PricingEngine:
    def __init__(self, strategy: DiscountStrategy): self.strategy = strategy
    def get_price(self, price: float) -> float: return self.strategy.calculate(price)
```

### Go
```go
// [PATTERN: Strategy]
type DiscountStrategy interface { Calculate(price float64) float64 }

type NoDiscount struct{}
type PercentageDiscount struct{ Percent float64 }

func (n NoDiscount) Calculate(p float64) float64        { return p }
func (d PercentageDiscount) Calculate(p float64) float64 { return p * (1 - d.Percent/100) }

type PricingEngine struct{ Strategy DiscountStrategy }
func (e PricingEngine) GetPrice(p float64) float64 { return e.Strategy.Calculate(p) }
```

---

## 6. Observer

**Intent:** Define a one-to-many dependency so that when one object changes state, all dependents are notified.

**Use when:** Multiple parts of the system need to react to an event (order placed, user registered, etc.)

**Do NOT use when:** Only one listener — a direct call is simpler.

### TypeScript
```typescript
// [PATTERN: Observer] — decouples order events from handlers
interface OrderObserver {
  onOrderPlaced(orderId: string): void;
}

class OrderService {
  private observers: OrderObserver[] = [];

  subscribe(observer: OrderObserver) { this.observers.push(observer); }

  placeOrder(orderId: string) {
    // ... core logic
    this.observers.forEach(o => o.onOrderPlaced(orderId));
  }
}

class EmailService implements OrderObserver {
  onOrderPlaced(orderId: string) { console.log(`Sending email for ${orderId}`); }
}
class InventoryService implements OrderObserver {
  onOrderPlaced(orderId: string) { console.log(`Updating inventory for ${orderId}`); }
}
```

---

## 7. Decorator

**Intent:** Attach additional responsibilities to an object dynamically.

**Use when:** You want to add behavior (logging, caching, auth) without modifying the base class.

### TypeScript
```typescript
// [PATTERN: Decorator] — adds logging without modifying UserRepository
interface UserRepository {
  findById(id: string): Promise<User>;
}

class LoggingUserRepository implements UserRepository {
  constructor(private inner: UserRepository) {}

  async findById(id: string): Promise<User> {
    console.log(`[LOG] findById called with ${id}`);
    const result = await this.inner.findById(id);
    console.log(`[LOG] findById returned ${result.name}`);
    return result;
  }
}
```

---

## 8. Command

**Intent:** Encapsulate a request as an object, allowing parameterization, queuing, and undo.

**Use when:** You need undo/redo, operation queuing, or want to decouple sender from receiver.

### TypeScript
```typescript
// [PATTERN: Command] — supports undo for text editor operations
interface Command {
  execute(): void;
  undo(): void;
}

class InsertTextCommand implements Command {
  constructor(
    private document: Document,
    private position: number,
    private text: string
  ) {}

  execute() { this.document.insert(this.position, this.text); }
  undo()    { this.document.delete(this.position, this.text.length); }
}

class CommandHistory {
  private history: Command[] = [];
  execute(cmd: Command) { cmd.execute(); this.history.push(cmd); }
  undo() { this.history.pop()?.undo(); }
}
```

---

## 9. Adapter

**Intent:** Convert the interface of a class into another interface clients expect.

**Use when:** Integrating third-party libraries or legacy code with incompatible interfaces.

### TypeScript
```typescript
// [PATTERN: Adapter] — wraps Razorpay SDK behind our PaymentGateway interface
interface PaymentGateway {
  charge(amount: number, currency: string): Promise<string>;
}

class RazorpayAdapter implements PaymentGateway {
  constructor(private razorpay: RazorpayClient) {}

  async charge(amount: number, currency: string): Promise<string> {
    const order = await this.razorpay.orders.create({ amount: amount * 100, currency });
    return order.id;
  }
}
```

---

## 10. Template Method

**Intent:** Define the skeleton of an algorithm in a base class; subclasses fill in specific steps.

**Use when:** Multiple classes share the same algorithm structure but differ in specific steps.

### TypeScript
```typescript
// [PATTERN: Template Method] — report structure is fixed; data source varies
abstract class ReportGenerator {
  // Template method — defines the skeleton
  generate(): string {
    const data = this.fetchData();        // step 1 — varies
    const formatted = this.format(data);  // step 2 — varies
    return this.addHeader(formatted);     // step 3 — fixed
  }

  protected abstract fetchData(): any[];
  protected abstract format(data: any[]): string;

  private addHeader(content: string): string {
    return `=== Report ===\n${content}`;
  }
}

class SalesReport extends ReportGenerator {
  protected fetchData() { return [{ item: 'Widget', qty: 100 }]; }
  protected format(data: any[]) { return data.map(d => `${d.item}: ${d.qty}`).join('\n'); }
}
```
