# Mock Guide — Mock · Stub · Spy · Fake · Dummy

The most misused vocabulary in testing. Using the wrong double makes tests
either too brittle or too weak. This guide tells you which one to reach for.

---

## The Five Test Doubles

| Double | What it does | Verifies calls? | Returns values? | Has logic? |
|--------|-------------|----------------|----------------|-----------|
| **Dummy** | Placeholder — never actually used | ✗ | ✗ | ✗ |
| **Stub** | Returns canned responses | ✗ | ✓ | ✗ |
| **Spy** | Real object that records interactions | ✓ | ✓ (real) | ✓ (real) |
| **Mock** | Pre-programmed with expectations | ✓ | ✓ (canned) | ✗ |
| **Fake** | Working lightweight implementation | ✗ | ✓ | ✓ |

---

## Decision Guide

```
Do I need to verify that a method WAS called?
  YES → Mock or Spy
  NO  → continue...

Do I need to control what the collaborator RETURNS?
  YES → Stub or Mock
  NO  → continue...

Do I need a real working implementation (e.g. in-memory DB)?
  YES → Fake
  NO  → Dummy (just need to satisfy a parameter)
```

---

## 1. Dummy

**When:** A parameter is required but the test doesn't use it.

```typescript
// [DUMMY] — logger required by constructor but this test doesn't care about logging
it('should calculate order total', () => {
  const nullLogger = null as any;   // dummy — never called
  const engine = new PricingEngine(nullLogger);
  const result = engine.calculateTotal([{ price: 100, qty: 2 }]);
  expect(result).toBe(200);
});
```

```python
# [DUMMY]
def test_calculates_order_total():
    dummy_logger = None  # never called in this test
    engine = PricingEngine(dummy_logger)
    assert engine.calculate_total([OrderItem(price=100, qty=2)]) == 200
```

---

## 2. Stub

**When:** You need to control indirect inputs — what a collaborator returns.
Does NOT verify whether it was called.

```typescript
// [STUB] — controls what UserRepository returns; doesn't verify it was called
it('should apply premium discount when user tier is premium', () => {
  // Arrange
  const userRepoStub = {
    findById: jest.fn().mockResolvedValue({ id: 'u1', tier: 'premium' }), // stub
  };
  const engine = new PricingEngine(userRepoStub);
  const order  = OrderMother.withTotal(100);

  // Act
  const result = await engine.applyUserDiscount(order, 'u1');

  // Assert — we care about the OUTCOME, not that findById was called
  expect(result.total).toBe(80);
});
```

```python
# [STUB] — pytest with unittest.mock
from unittest.mock import AsyncMock

async def test_applies_premium_discount():
    # Arrange
    user_repo_stub = AsyncMock()
    user_repo_stub.find_by_id.return_value = User(tier='premium')  # stub return value
    engine = PricingEngine(user_repo_stub)

    # Act
    result = await engine.apply_user_discount(OrderMother.with_total(100), 'u1')

    # Assert outcome — not that find_by_id was called
    assert result.total == 80
```

```go
// [STUB] — Go interface stub
type stubUserRepo struct{ user User }
func (s stubUserRepo) FindByID(_ string) (User, error) { return s.user, nil }

func TestPricingEngine_AppliesPremiumDiscount(t *testing.T) {
    stub := stubUserRepo{user: User{Tier: "premium"}}
    engine := NewPricingEngine(stub)
    result := engine.ApplyUserDiscount(OrderWithTotal(100), "u1")
    if result.Total != 80 { t.Errorf("expected 80, got %f", result.Total) }
}
```

---

## 3. Mock

**When:** You need to verify that a collaboration happened — did X get called with Y?
Mocks are about **behaviour verification**, not state verification.

```typescript
// [MOCK] — verifies that EmailService.send() was called with correct args
it('should send confirmation email after order is placed', async () => {
  // Arrange
  const emailServiceMock = { send: jest.fn().mockResolvedValue(undefined) };
  const service = new OrderService(orderRepo, emailServiceMock);

  // Act
  await service.placeOrder(OrderMother.default());

  // Assert — verify the INTERACTION happened
  expect(emailServiceMock.send).toHaveBeenCalledOnce();
  expect(emailServiceMock.send).toHaveBeenCalledWith(
    expect.objectContaining({
      to:      'test@example.com',
      subject: expect.stringContaining('Order Confirmed'),
    })
  );
});
```

```python
# [MOCK] — verify EventBus.publish was called
from unittest.mock import AsyncMock, call

async def test_publishes_order_placed_event():
    event_bus_mock = AsyncMock()
    service = OrderService(order_repo, event_bus_mock)

    await service.place_order(OrderMother.default())

    event_bus_mock.publish.assert_called_once()
    args = event_bus_mock.publish.call_args[0][0]
    assert isinstance(args, OrderPlacedEvent)
    assert args.order_id == 'ord_001'
```

```java
// [MOCK] — Mockito
@ExtendWith(MockitoExtension.class)
class OrderServiceTest {
    @Mock EmailService emailService;
    @InjectMocks OrderService service;

    @Test
    void shouldSendConfirmationEmailAfterOrderPlaced() {
        service.placeOrder(OrderMother.defaults());

        verify(emailService).send(argThat(email ->
            email.getTo().equals("test@example.com") &&
            email.getSubject().contains("Order Confirmed")
        ));
    }
}
```

---

## 4. Spy

**When:** You want the real implementation but also want to observe/record what happened.
Use sparingly — spies can make tests brittle.

```typescript
// [SPY] — real EventEmitter but we watch what events were emitted
it('should emit order.placed event', async () => {
  const realEventEmitter = new EventEmitter();  // real implementation
  const spy = jest.spyOn(realEventEmitter, 'emit');  // spy on it

  const service = new OrderService(orderRepo, realEventEmitter);
  await service.placeOrder(OrderMother.default());

  expect(spy).toHaveBeenCalledWith('order.placed', expect.objectContaining({
    orderId: expect.any(String),
  }));
});
```

```python
# [SPY] — spy on real object method
from unittest.mock import patch, MagicMock

def test_calls_inventory_reserve():
    inventory = InventoryService()  # real implementation
    with patch.object(inventory, 'reserve', wraps=inventory.reserve) as spy:
        service = OrderService(order_repo, inventory)
        service.place_order(OrderMother.default())

        spy.assert_called_once_with(OrderMother.default().items)
```

---

## 5. Fake

**When:** A real lightweight implementation is easier than a stub/mock, especially for repositories and event buses.
Fakes have logic — they actually work, just with simplified infrastructure.

```typescript
// [FAKE] — in-memory OrderRepository — actually stores and retrieves
export class InMemoryOrderRepository implements IOrderRepository {
  private store = new Map<string, Order>();

  async findById(id: string): Promise<Order | null> {
    return this.store.get(id) ?? null;
  }

  async save(order: Order): Promise<void> {
    this.store.set(order.id, order);
  }

  // Test helper — not part of the interface
  count(): number { return this.store.size; }
  all(): Order[]  { return [...this.store.values()]; }
}

// [FAKE] — in-memory event bus
export class FakeEventBus implements IEventBus {
  public published: DomainEvent[] = [];

  async publish(event: DomainEvent): Promise<void> {
    this.published.push(event);
  }

  // Test helper
  eventsOf<T>(type: new (...args: any[]) => T): T[] {
    return this.published.filter(e => e instanceof type) as T[];
  }
}

// Tests using fakes — no mocking framework needed, clean and readable
describe('OrderService', () => {
  let repo: InMemoryOrderRepository;
  let bus:  FakeEventBus;
  let svc:  OrderService;

  beforeEach(() => {
    repo = new InMemoryOrderRepository();
    bus  = new FakeEventBus();
    svc  = new OrderService(repo, bus);
  });

  it('should persist the order', async () => {
    await svc.placeOrder(OrderMother.default());
    expect(repo.count()).toBe(1);
  });

  it('should publish OrderPlacedEvent', async () => {
    await svc.placeOrder(OrderMother.default());
    expect(bus.eventsOf(OrderPlacedEvent)).toHaveLength(1);
  });
});
```

```python
# [FAKE] — Python in-memory repository
class InMemoryOrderRepository(OrderRepository):
    def __init__(self):
        self._store: dict[str, Order] = {}

    async def find_by_id(self, id: str) -> Order | None:
        return self._store.get(id)

    async def save(self, order: Order) -> None:
        self._store[order.id] = order

    def count(self) -> int:
        return len(self._store)

    def all(self) -> list[Order]:
        return list(self._store.values())
```

```go
// [FAKE] — Go in-memory repository
type InMemoryOrderRepo struct {
    store map[string]Order
    mu    sync.RWMutex
}

func NewInMemoryOrderRepo() *InMemoryOrderRepo {
    return &InMemoryOrderRepo{store: make(map[string]Order)}
}

func (r *InMemoryOrderRepo) FindByID(id string) (Order, error) {
    r.mu.RLock(); defer r.mu.RUnlock()
    o, ok := r.store[id]
    if !ok { return Order{}, ErrNotFound }
    return o, nil
}

func (r *InMemoryOrderRepo) Save(order Order) error {
    r.mu.Lock(); defer r.mu.Unlock()
    r.store[order.ID] = order
    return nil
}

func (r *InMemoryOrderRepo) Count() int {
    r.mu.RLock(); defer r.mu.RUnlock()
    return len(r.store)
}
```

---

## Common Mistakes

### Over-Mocking
```typescript
// [ANTI-PATTERN: Mocking everything — tests the mock, not the code]
it('should calculate total', () => {
  const mockItem = { getPrice: jest.fn().mockReturnValue(100), getQty: jest.fn().mockReturnValue(2) };
  const mockOrder = { getItems: jest.fn().mockReturnValue([mockItem]) };

  const result = new PricingEngine().calculateTotal(mockOrder as any);
  expect(result).toBe(200);
  // If calculateTotal is refactored to use item.subtotal instead of price*qty, this breaks
  // despite the logic being correct
});

// [FIX: Use real objects for value types — mock only infrastructure]
it('should calculate total', () => {
  const order = new Order([new OrderItem(100, 2)]);  // real objects
  const result = new PricingEngine().calculateTotal(order);
  expect(result).toBe(200);
});
```

### Verifying Implementation Instead of Behaviour
```typescript
// [ANTI-PATTERN: Testing HOW, not WHAT]
it('should call repository.save exactly once', () => {
  const repo = { save: jest.fn() };
  service.placeOrder(order);
  expect(repo.save).toHaveBeenCalledTimes(1); // breaks if save is called via helper
});

// [FIX: Test the observable outcome]
it('should persist order after placement', async () => {
  await service.placeOrder(order);
  const saved = await repo.findById(order.id);
  expect(saved).not.toBeNull();
  expect(saved!.status).toBe('PENDING');
});
```

---

## Quick Selector

```
Need to fill a parameter that's never used?   → Dummy
Need to control what a dependency returns?    → Stub
Need to verify a method was called?           → Mock
Need real behaviour + interaction recording?  → Spy
Need a working in-memory implementation?      → Fake (preferred for repos/buses)
```
