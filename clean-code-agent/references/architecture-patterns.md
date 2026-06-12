# Architecture Patterns Reference

High-level architectural patterns for production systems. Each entry covers:
- **Intent** — what problem it solves
- **When to use / When NOT to use**
- **Structure** — layers, components, data flow
- **Polyglot examples** — TypeScript, Python, Go, Java

---

## Table of Contents

1. [Clean Architecture](#1-clean-architecture)
2. [Hexagonal Architecture (Ports & Adapters)](#2-hexagonal-architecture-ports--adapters)
3. [CQRS (Command Query Responsibility Segregation)](#3-cqrs)
4. [Event Sourcing](#4-event-sourcing)
5. [Repository Pattern](#5-repository-pattern)
6. [Saga Pattern](#6-saga-pattern)
7. [Decision Guide — Which Pattern When](#7-decision-guide)

---

## 1. Clean Architecture

**Intent:** Separate business rules from infrastructure. The domain never depends on frameworks, DBs, or UI.

**Use when:**
- Application has complex business logic that must be testable in isolation
- You want to swap DB, framework, or UI without touching business rules
- Team size > 3 — boundaries enforce discipline

**Do NOT use when:**
- Simple CRUD app with no business rules — YAGNI, use MVC
- < 3 months runway — complexity cost not justified yet

### Layer Structure
```
┌─────────────────────────────────────┐
│           Frameworks & Drivers       │  ← Express, FastAPI, React, DB drivers
│  ┌───────────────────────────────┐  │
│  │    Interface Adapters          │  │  ← Controllers, Presenters, Gateways
│  │  ┌─────────────────────────┐  │  │
│  │  │   Application / Use Cases│  │  │  ← Business workflows (no framework deps)
│  │  │  ┌───────────────────┐  │  │  │
│  │  │  │   Domain / Entities│  │  │  │  ← Pure business rules, no dependencies
│  │  │  └───────────────────┘  │  │  │
│  │  └─────────────────────────┘  │  │
│  └───────────────────────────────┘  │
└─────────────────────────────────────┘

Dependency Rule: arrows point INWARD only. Domain knows nothing outside itself.
```

### TypeScript — Folder Structure
```
src/
├── domain/                    ← innermost — zero dependencies
│   ├── entities/
│   │   └── Order.ts           ← pure business rules
│   ├── value-objects/
│   │   └── Money.ts
│   └── repositories/
│       └── IOrderRepository.ts ← interface only — no implementation
│
├── application/               ← use cases — depends on domain only
│   └── use-cases/
│       └── PlaceOrderUseCase.ts
│
├── infrastructure/            ← depends on application + domain
│   ├── database/
│   │   └── PostgresOrderRepository.ts  ← implements IOrderRepository
│   └── messaging/
│       └── RabbitMQEventBus.ts
│
└── presentation/              ← outermost — depends on application
    └── http/
        └── OrderController.ts
```

### TypeScript — Implementation
```typescript
// domain/entities/Order.ts — pure business rules, zero imports from outside
export class Order {
  private items: OrderItem[] = [];
  private status: OrderStatus = OrderStatus.PENDING;

  addItem(item: OrderItem): void {
    if (this.status !== OrderStatus.PENDING)
      throw new Error('Cannot modify a non-pending order');
    this.items.push(item);
  }

  get total(): Money {
    return this.items.reduce((sum, i) => sum.add(i.subtotal), Money.zero());
  }
}

// domain/repositories/IOrderRepository.ts — interface, no DB code
export interface IOrderRepository {
  findById(id: OrderId): Promise<Order | null>;
  save(order: Order): Promise<void>;
}

// application/use-cases/PlaceOrderUseCase.ts — orchestrates, no DB/HTTP
export class PlaceOrderUseCase {
  constructor(
    private readonly orders: IOrderRepository,   // [SOLID: DIP]
    private readonly inventory: IInventoryService,
    private readonly events: IEventBus,
  ) {}

  async execute(cmd: PlaceOrderCommand): Promise<OrderId> {
    await this.inventory.reserve(cmd.items);
    const order = Order.create(cmd);
    await this.orders.save(order);
    await this.events.publish(new OrderPlacedEvent(order.id));
    return order.id;
  }
}

// infrastructure/database/PostgresOrderRepository.ts — DB detail lives here
export class PostgresOrderRepository implements IOrderRepository {
  constructor(private db: Pool) {}

  async findById(id: OrderId): Promise<Order | null> {
    const row = await this.db.query('SELECT * FROM orders WHERE id=$1', [id]);
    return row ? OrderMapper.toDomain(row) : null;
  }

  async save(order: Order): Promise<void> {
    await this.db.query('INSERT INTO orders ...', OrderMapper.toPersistence(order));
  }
}
```

### Python — Clean Architecture
```python
# domain/order.py — pure domain, no frameworks
from dataclasses import dataclass, field
from decimal import Decimal

@dataclass
class Order:
    id: str
    items: list['OrderItem'] = field(default_factory=list)
    status: str = 'pending'

    def add_item(self, item: 'OrderItem') -> None:
        if self.status != 'pending':
            raise ValueError('Cannot modify non-pending order')
        self.items.append(item)

    @property
    def total(self) -> Decimal:
        return sum(i.subtotal for i in self.items)

# domain/repositories.py — interface only
from abc import ABC, abstractmethod

class OrderRepository(ABC):
    @abstractmethod
    async def find_by_id(self, id: str) -> Order | None: ...
    @abstractmethod
    async def save(self, order: Order) -> None: ...

# application/use_cases/place_order.py — no framework imports
class PlaceOrderUseCase:
    def __init__(self, orders: OrderRepository, events: EventBus):
        self._orders = orders
        self._events = events

    async def execute(self, cmd: PlaceOrderCommand) -> str:
        order = Order(id=generate_id(), items=cmd.items)
        await self._orders.save(order)
        await self._events.publish(OrderPlacedEvent(order.id))
        return order.id
```

---

## 2. Hexagonal Architecture (Ports & Adapters)

**Intent:** The application core communicates with the outside world only through ports (interfaces). Adapters implement the ports. The core is fully isolated.

**Use when:** Multiple delivery mechanisms (REST + CLI + message queue) or multiple infrastructure implementations (Postgres + MongoDB).

**Difference from Clean Architecture:** Hexagonal is flatter — no strict inner layers. Port/Adapter is the main concept. Clean Architecture defines more internal layer structure.

### Structure
```
           [ REST Adapter ]  [ CLI Adapter ]  [ Test Adapter ]
                  │                │                │
                  └────────────────┴────────────────┘
                                   │
                          [ Inbound Ports ]
                                   │
                    ┌──────────────────────────┐
                    │     APPLICATION CORE      │
                    │   (pure business logic)   │
                    └──────────────────────────┘
                                   │
                         [ Outbound Ports ]
                                   │
                  ┌────────────────┴────────────────┐
        [ Postgres Adapter ]  [ Redis Adapter ]  [ SMTP Adapter ]
```

### TypeScript
```typescript
// Inbound port — how the outside world drives the app
export interface OrderPort {
  placeOrder(cmd: PlaceOrderCommand): Promise<OrderId>;
  getOrder(id: OrderId): Promise<OrderDTO>;
}

// Outbound port — how the app talks to infrastructure
export interface OrderStoragePort {
  persist(order: Order): Promise<void>;
  retrieve(id: OrderId): Promise<Order | null>;
}

// Core — implements inbound port, depends on outbound port
export class OrderService implements OrderPort {
  constructor(private storage: OrderStoragePort) {}  // [SOLID: DIP]

  async placeOrder(cmd: PlaceOrderCommand): Promise<OrderId> {
    const order = Order.create(cmd);
    await this.storage.persist(order);
    return order.id;
  }

  async getOrder(id: OrderId): Promise<OrderDTO> {
    const order = await this.storage.retrieve(id);
    if (!order) throw new NotFoundError(id);
    return OrderMapper.toDTO(order);
  }
}

// Inbound adapter — REST drives the core via port
export class OrderHttpAdapter {
  constructor(private port: OrderPort) {}
  async handlePost(req: Request): Promise<Response> {
    const id = await this.port.placeOrder(req.body);
    return Response.json({ id }, { status: 201 });
  }
}

// Outbound adapter — Postgres implements storage port
export class PostgresOrderAdapter implements OrderStoragePort {
  async persist(order: Order): Promise<void> { /* SQL */ }
  async retrieve(id: OrderId): Promise<Order | null> { /* SQL */ }
}

// Test adapter — in-memory, zero DB needed
export class InMemoryOrderAdapter implements OrderStoragePort {
  private store = new Map<string, Order>();
  async persist(order: Order) { this.store.set(order.id, order); }
  async retrieve(id: OrderId) { return this.store.get(id) ?? null; }
}
```

---

## 3. CQRS

**Intent:** Separate the model used for reads (Queries) from the model used for writes (Commands). Different optimisation, different scaling.

**Use when:**
- Read and write workloads differ significantly (read-heavy apps)
- Read model needs joins/projections the write model doesn't
- You need audit trails or event history

**Do NOT use when:**
- Simple CRUD — massive overkill, violates YAGNI
- Small team without event-driven experience

### Structure
```
Client
  │
  ├─── Command ──→ CommandHandler ──→ Write Model (normalised DB)
  │                                         │
  │                                    Domain Events
  │                                         │
  │                                   Projector / Sync
  │                                         │
  └─── Query  ──→ QueryHandler  ──→ Read Model (denormalised, optimised for UI)
```

### TypeScript
```typescript
// ── COMMAND SIDE ──────────────────────────────────────────────────────────

// Commands — intent to change state
export class PlaceOrderCommand {
  constructor(
    public readonly userId: UserId,
    public readonly items: OrderItem[],
  ) {}
}

export class PlaceOrderHandler {
  constructor(
    private orders: IOrderRepository,
    private events: IEventBus,
  ) {}

  async handle(cmd: PlaceOrderCommand): Promise<OrderId> {
    const order = Order.create(cmd.userId, cmd.items);
    await this.orders.save(order);
    await this.events.publish(new OrderPlacedEvent(order));
    return order.id;
  }
}

// ── QUERY SIDE ────────────────────────────────────────────────────────────

// Read model — optimised flat projection for UI
export interface OrderSummaryView {
  id: string;
  customerName: string;
  totalAmount: string;
  status: string;
  itemCount: number;
  createdAt: string;
}

export class GetOrderSummaryQuery {
  constructor(public readonly orderId: string) {}
}

export class GetOrderSummaryHandler {
  constructor(private readDb: ReadDatabase) {}  // separate read DB/cache

  async handle(query: GetOrderSummaryQuery): Promise<OrderSummaryView> {
    // Direct SQL on read model — no domain objects, no business rules
    return this.readDb.queryOne<OrderSummaryView>(
      `SELECT o.id, u.name AS customer_name, o.total_amount,
              o.status, o.item_count, o.created_at
       FROM order_summaries o JOIN users u ON o.user_id = u.id
       WHERE o.id = $1`,
      [query.orderId]
    );
  }
}

// ── PROJECTOR — syncs write model events to read model ────────────────────
export class OrderSummaryProjector {
  onOrderPlaced(event: OrderPlacedEvent): void {
    this.readDb.upsert('order_summaries', {
      id: event.orderId,
      customer_name: event.customerName,
      total_amount: event.total.toString(),
      status: 'pending',
      item_count: event.items.length,
    });
  }
}
```

### Go — CQRS
```go
// Command side
type PlaceOrderCommand struct {
    UserID string
    Items  []OrderItem
}

type PlaceOrderHandler struct {
    repo   OrderRepository
    events EventBus
}

func (h *PlaceOrderHandler) Handle(cmd PlaceOrderCommand) (string, error) {
    order := NewOrder(cmd.UserID, cmd.Items)
    if err := h.repo.Save(order); err != nil { return "", err }
    h.events.Publish(OrderPlacedEvent{OrderID: order.ID})
    return order.ID, nil
}

// Query side
type OrderSummaryView struct {
    ID           string
    CustomerName string
    TotalAmount  float64
    Status       string
}

type GetOrderSummaryHandler struct {
    readDB *sql.DB
}

func (h *GetOrderSummaryHandler) Handle(orderID string) (*OrderSummaryView, error) {
    var view OrderSummaryView
    err := h.readDB.QueryRow(
        `SELECT id, customer_name, total_amount, status
         FROM order_summaries WHERE id = $1`, orderID,
    ).Scan(&view.ID, &view.CustomerName, &view.TotalAmount, &view.Status)
    return &view, err
}
```

---

## 4. Event Sourcing

**Intent:** Store state as a sequence of events, not current values. Reconstruct state by replaying events.

**Use when:**
- Complete audit trail required (finance, healthcare, legal)
- Need time-travel debugging (replay state at any point)
- Pairs naturally with CQRS for read model projections

**Do NOT use when:**
- Simple apps where audit is not a requirement — YAGNI
- Team unfamiliar with event-driven systems — high learning curve

### TypeScript
```typescript
// Events — immutable facts that happened
interface DomainEvent {
  readonly eventId: string;
  readonly occurredAt: Date;
}

class OrderPlacedEvent implements DomainEvent {
  readonly eventId = crypto.randomUUID();
  readonly occurredAt = new Date();
  constructor(
    public readonly orderId: string,
    public readonly userId: string,
    public readonly items: OrderItem[],
  ) {}
}

class OrderCancelledEvent implements DomainEvent {
  readonly eventId = crypto.randomUUID();
  readonly occurredAt = new Date();
  constructor(
    public readonly orderId: string,
    public readonly reason: string,
  ) {}
}

// Aggregate — rebuilt by replaying events
class Order {
  private _status: string = 'new';
  private _items: OrderItem[] = [];
  private _uncommittedEvents: DomainEvent[] = [];

  // Replay events to rebuild state
  static fromEvents(events: DomainEvent[]): Order {
    const order = new Order();
    events.forEach(e => order.apply(e));
    return order;
  }

  // Business method — raises event instead of mutating state directly
  cancel(reason: string): void {
    if (this._status === 'cancelled') throw new Error('Already cancelled');
    this.apply(new OrderCancelledEvent(this.id, reason));
  }

  private apply(event: DomainEvent): void {
    if (event instanceof OrderPlacedEvent) {
      this._status = 'pending';
      this._items = event.items;
    }
    if (event instanceof OrderCancelledEvent) {
      this._status = 'cancelled';
    }
    this._uncommittedEvents.push(event);
  }

  get uncommittedEvents() { return [...this._uncommittedEvents]; }
  clearEvents() { this._uncommittedEvents = []; }
}

// Event Store — append-only
interface EventStore {
  append(streamId: string, events: DomainEvent[], expectedVersion: number): Promise<void>;
  load(streamId: string): Promise<DomainEvent[]>;
}
```

---

## 5. Repository Pattern

**Intent:** Abstract the data access layer behind a collection-like interface. Business logic works with domain objects, not SQL/ORM.

**Use when:** Any non-trivial application with a persistence layer.

**This is the minimum pattern** — use even when not doing Clean Architecture.

### TypeScript
```typescript
// Interface — defined in domain layer
export interface UserRepository {
  findById(id: UserId): Promise<User | null>;
  findByEmail(email: Email): Promise<User | null>;
  save(user: User): Promise<void>;
  delete(id: UserId): Promise<void>;
  findAll(filter: UserFilter): Promise<User[]>;
}

// Implementation — lives in infrastructure
export class PostgresUserRepository implements UserRepository {
  constructor(private db: Pool) {}

  async findById(id: UserId): Promise<User | null> {
    const row = await this.db.query<UserRow>(
      'SELECT * FROM users WHERE id = $1 AND deleted_at IS NULL', [id]
    );
    return row ? UserMapper.toDomain(row) : null;
  }

  async save(user: User): Promise<void> {
    const data = UserMapper.toPersistence(user);
    await this.db.query(
      `INSERT INTO users (id, name, email, created_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (id) DO UPDATE SET name=$2, email=$3`,
      [data.id, data.name, data.email, data.createdAt]
    );
  }
}

// Mapper — keeps domain objects clean of persistence concerns
class UserMapper {
  static toDomain(row: UserRow): User {
    return new User(
      UserId.from(row.id),
      new Email(row.email),
      row.name,
      row.created_at,
    );
  }

  static toPersistence(user: User): UserRow {
    return {
      id: user.id.toString(),
      email: user.email.toString(),
      name: user.name,
      created_at: user.createdAt,
    };
  }
}
```

### Python
```python
from abc import ABC, abstractmethod

class UserRepository(ABC):
    @abstractmethod
    async def find_by_id(self, id: str) -> User | None: ...
    @abstractmethod
    async def find_by_email(self, email: str) -> User | None: ...
    @abstractmethod
    async def save(self, user: User) -> None: ...

class PostgresUserRepository(UserRepository):
    def __init__(self, pool: asyncpg.Pool):
        self._pool = pool

    async def find_by_id(self, id: str) -> User | None:
        async with self._pool.acquire() as conn:
            row = await conn.fetchrow('SELECT * FROM users WHERE id=$1', id)
            return UserMapper.to_domain(row) if row else None

    async def save(self, user: User) -> None:
        async with self._pool.acquire() as conn:
            await conn.execute(
                'INSERT INTO users (id, name, email) VALUES ($1,$2,$3) '
                'ON CONFLICT (id) DO UPDATE SET name=$2, email=$3',
                user.id, user.name, user.email
            )
```

---

## 6. Saga Pattern

**Intent:** Manage long-running distributed transactions across multiple services without 2PC. Each step publishes events; compensating transactions roll back on failure.

**Use when:**
- Distributed system with multiple services that must stay consistent
- Operations span multiple bounded contexts (Order → Payment → Inventory → Shipping)

**Do NOT use when:**
- Monolith with a single database — use DB transactions instead

### Two Flavours

#### Choreography (event-driven, decentralised)
```typescript
// Each service reacts to events and publishes its own
// Order Service
class OrderService {
  async placeOrder(cmd: PlaceOrderCommand) {
    const order = Order.create(cmd);
    await this.orders.save(order);
    await this.events.publish(new OrderCreatedEvent(order)); // triggers Payment Service
  }
}

// Payment Service — reacts to OrderCreated
class PaymentService {
  async onOrderCreated(event: OrderCreatedEvent) {
    try {
      const payment = await this.processPayment(event.total, event.paymentMethod);
      await this.events.publish(new PaymentSucceededEvent(event.orderId, payment.id));
    } catch {
      await this.events.publish(new PaymentFailedEvent(event.orderId)); // triggers compensation
    }
  }
}

// Order Service — compensates on PaymentFailed
class OrderService {
  async onPaymentFailed(event: PaymentFailedEvent) {
    const order = await this.orders.findById(event.orderId);
    order.cancel('Payment failed');
    await this.orders.save(order);
    await this.events.publish(new OrderCancelledEvent(order.id));
  }
}
```

#### Orchestration (centralised, explicit)
```typescript
// Saga Orchestrator — owns the workflow and compensation logic
class PlaceOrderSaga {
  async execute(cmd: PlaceOrderCommand): Promise<void> {
    let orderId: string | null = null;
    let paymentId: string | null = null;

    try {
      // Step 1
      orderId = await this.orderService.create(cmd);
      // Step 2
      paymentId = await this.paymentService.charge(cmd.total, cmd.paymentMethod);
      // Step 3
      await this.inventoryService.reserve(cmd.items);
      // Step 4
      await this.shippingService.schedule(orderId);

    } catch (error) {
      // Compensate in reverse order
      if (paymentId)  await this.paymentService.refund(paymentId);
      if (orderId)    await this.orderService.cancel(orderId, error.message);
      throw error;
    }
  }
}
```

---

## 7. Decision Guide

```
What is your problem?

  Complex business rules that need isolation from frameworks?
  └─ YES → Clean Architecture or Hexagonal Architecture
       └─ Multiple delivery mechanisms (REST + CLI + Queue)?
            └─ YES → Hexagonal (Ports & Adapters)
            └─ NO  → Clean Architecture

  Read and write models need different optimisation?
  └─ YES → CQRS
       └─ Also need full audit trail or time-travel debugging?
            └─ YES → CQRS + Event Sourcing
            └─ NO  → CQRS alone is enough

  Multiple services need to stay consistent without 2PC?
  └─ YES → Saga Pattern
       └─ Small team, prefer explicit workflow?
            └─ YES → Orchestration Saga
            └─ NO  → Choreography Saga (event-driven)

  Just need to decouple business logic from DB?
  └─ YES → Repository Pattern (minimum viable architecture pattern)

  None of the above? Simple CRUD app?
  └─ YES → [YAGNI] Skip all of the above. Plain MVC + Repository is fine.
```

---

## Architecture Anti-Patterns to Avoid

```
[ARCH-WARN] Anemic Domain Model
  — Entities with only getters/setters; all logic in Services
  — Fix: move business rules into the entity itself

[ARCH-WARN] Fat Controller
  — Business logic in HTTP handlers/controllers
  — Fix: controller delegates to use case / service; never contains if/else business logic

[ARCH-WARN] Smart Infrastructure
  — Business decisions in DB stored procedures, triggers, or ORM callbacks
  — Fix: move decisions to domain; DB is a dumb persistence store

[ARCH-WARN] God Service
  — One service class imports 10 other services
  — Fix: decompose into focused use cases; apply SRP at the service level

[ARCH-WARN] Distributed Monolith
  — Microservices that make synchronous calls to each other on every request
  — Fix: favour async events; redesign bounded contexts to reduce coupling
```
