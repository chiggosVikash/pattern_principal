# Test Patterns

Structural patterns for writing clean, readable, maintainable tests.

---

## 1. AAA — Arrange · Act · Assert

Every test body has exactly three sections. No logic between them.

```typescript
it('should apply 20% discount for premium users', () => {
  // ARRANGE — set up everything the test needs
  const user  = new User({ tier: 'premium' });
  const order = new Order({ items: [{ price: Money.of(100, 'INR') }] });
  const engine = new PricingEngine();

  // ACT — single action under test
  const discounted = engine.applyDiscount(order, user);

  // ASSERT — verify expected outcome
  expect(discounted.total).toEqual(Money.of(80, 'INR'));
});
```

```python
# Python — pytest
def test_applies_20_percent_discount_for_premium_users():
    # Arrange
    user   = User(tier='premium')
    order  = Order(items=[OrderItem(price=Decimal('100.00'))])
    engine = PricingEngine()

    # Act
    discounted = engine.apply_discount(order, user)

    # Assert
    assert discounted.total == Decimal('80.00')
```

```go
// Go
func TestPricingEngine_Applies20PercentDiscountForPremiumUsers(t *testing.T) {
    // Arrange
    user  := User{Tier: "premium"}
    order := Order{Items: []OrderItem{{Price: 100.0}}}
    engine := NewPricingEngine()

    // Act
    discounted := engine.ApplyDiscount(order, user)

    // Assert
    if discounted.Total != 80.0 {
        t.Errorf("expected 80.0, got %f", discounted.Total)
    }
}
```

### AAA Rules
- **Arrange** — no assertions here; just setup
- **Act** — one line only; if you need more, extract a helper
- **Assert** — one conceptual assertion (can be multiple `expect()` lines for the same concept)
- **Blank lines** separate the three sections
- **No `if` statements** in test body — conditional assertions hide bugs

---

## 2. Object Mother

Creates pre-built test objects with sensible defaults. Eliminates repetitive `new User({...})` setup.

```typescript
// [PATTERN: Object Mother]
export class UserMother {
  static default(): User {
    return new User({
      id: 'usr_test_001',
      name: 'Test User',
      email: new Email('test@example.com'),
      tier: 'basic',
      createdAt: new Date('2024-01-01'),
    });
  }

  static premium(): User {
    return new User({ ...UserMother.default(), tier: 'premium' });
  }

  static inactive(): User {
    return new User({ ...UserMother.default(), isActive: false });
  }

  static withEmail(email: string): User {
    return new User({ ...UserMother.default(), email: new Email(email) });
  }
}

// Usage — test setup becomes one line
it('should reject orders from inactive users', () => {
  const user = UserMother.inactive();         // ← clean, readable
  const order = OrderMother.default();
  expect(() => service.placeOrder(user, order)).toThrow('User account is inactive');
});
```

```python
# Python Object Mother
class UserMother:
    @staticmethod
    def default() -> User:
        return User(id='usr_001', name='Test User',
                    email='test@example.com', tier='basic')

    @staticmethod
    def premium() -> User:
        u = UserMother.default()
        u.tier = 'premium'
        return u

    @staticmethod
    def inactive() -> User:
        u = UserMother.default()
        u.is_active = False
        return u
```

---

## 3. Test Builder (Fluent)

When Object Mother isn't flexible enough — use a builder for complex objects.

```typescript
// [PATTERN: Test Builder]
export class OrderBuilder {
  private items: OrderItem[] = [];
  private userId = 'usr_test';
  private coupon?: string;

  withItem(price: number, qty = 1): this {
    this.items.push({ price: Money.of(price, 'INR'), qty });
    return this;
  }
  withUser(userId: string): this { this.userId = userId; return this; }
  withCoupon(code: string): this { this.coupon = code; return this; }

  build(): Order {
    return new Order({ userId: this.userId, items: this.items, coupon: this.coupon });
  }
}

// Test reads like a specification:
it('should apply coupon before calculating total', () => {
  const order = new OrderBuilder()
    .withItem(100)
    .withItem(50)
    .withCoupon('SAVE10')
    .build();

  const total = pricingEngine.calculate(order);
  expect(total).toEqual(Money.of(135, 'INR')); // 150 - 10%
});
```

---

## 4. Parameterised Tests

DRY for tests — same test logic, different inputs. Never copy-paste a test to change one value.

```typescript
// [PATTERN: Parameterised — Jest test.each]
describe('PasswordValidator', () => {
  test.each([
    ['abc',        false, 'too short'],
    ['abcdefgh',   false, 'no number'],
    ['abcdefg1',   true,  'valid'],
    ['A1b2C3d4',   true,  'valid with uppercase'],
    ['',           false, 'empty string'],
    ['1234567890', false, 'numbers only — no letter'],
  ])('validate("%s") → isValid=%s (%s)', (password, expected) => {
    const result = new PasswordValidator().validate(password);
    expect(result.isValid).toBe(expected);
  });
});
```

```python
# Python — pytest.mark.parametrize
import pytest

@pytest.mark.parametrize("password,expected", [
    ("abc",        False),
    ("abcdefgh",   False),
    ("abcdefg1",   True),
    ("A1b2C3d4",   True),
    ("",           False),
    ("1234567890", False),
])
def test_password_validation(password: str, expected: bool):
    result = PasswordValidator().validate(password)
    assert result.is_valid == expected
```

```go
// Go — table-driven tests
func TestPasswordValidator(t *testing.T) {
    tests := []struct {
        password string
        want     bool
        name     string
    }{
        {"abc",        false, "too short"},
        {"abcdefgh",   false, "no number"},
        {"abcdefg1",   true,  "valid"},
        {"",           false, "empty"},
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            got := NewPasswordValidator().Validate(tt.password)
            if got.IsValid != tt.want {
                t.Errorf("Validate(%q) = %v, want %v", tt.password, got.IsValid, tt.want)
            }
        })
    }
}
```

```java
// Java — JUnit 5 @ParameterizedTest
@ParameterizedTest(name = "validate({0}) → {1}")
@CsvSource({
    "abc,       false",
    "abcdefgh,  false",
    "abcdefg1,  true",
    "A1b2C3d4,  true",
    "'',        false",
})
void testPasswordValidation(String password, boolean expected) {
    ValidationResult result = new PasswordValidator().validate(password);
    assertEquals(expected, result.isValid());
}
```

---

## 5. Test Fixture

Shared setup and teardown — use when multiple tests need the same starting state.

```typescript
// [PATTERN: Test Fixture — Jest beforeEach/afterEach]
describe('OrderService', () => {
  let service: OrderService;
  let orderRepo: InMemoryOrderRepository;
  let eventBus: FakeEventBus;

  beforeEach(() => {
    // Fresh state for every test — no shared mutation
    orderRepo = new InMemoryOrderRepository();
    eventBus  = new FakeEventBus();
    service   = new OrderService(orderRepo, eventBus);
  });

  it('should persist order on placement', async () => {
    await service.placeOrder(OrderMother.default());
    expect(orderRepo.count()).toBe(1);
  });

  it('should publish OrderPlacedEvent', async () => {
    await service.placeOrder(OrderMother.default());
    expect(eventBus.published).toContainEqual(expect.objectContaining({
      type: 'OrderPlaced',
    }));
  });
});
```

```python
# Python — pytest fixtures
import pytest

@pytest.fixture
def order_repo():
    return InMemoryOrderRepository()

@pytest.fixture
def event_bus():
    return FakeEventBus()

@pytest.fixture
def order_service(order_repo, event_bus):
    return OrderService(order_repo, event_bus)

def test_persists_order_on_placement(order_service, order_repo):
    order_service.place_order(OrderMother.default())
    assert order_repo.count() == 1

def test_publishes_order_placed_event(order_service, event_bus):
    order_service.place_order(OrderMother.default())
    assert any(e.type == 'OrderPlaced' for e in event_bus.published)
```

---

## 6. Boundary Value Analysis

Test the edges — not just the happy middle. Most bugs live at boundaries.

```typescript
// [PATTERN: Boundary Value Analysis]
describe('AgeValidator', () => {
  // Boundary: minimum age = 18
  it('should reject age 17 (below minimum)',  () => expect(validate(17)).toBe(false));
  it('should accept age 18 (exact minimum)',  () => expect(validate(18)).toBe(true));
  it('should accept age 19 (above minimum)',  () => expect(validate(19)).toBe(true));

  // Boundary: maximum age = 120
  it('should accept age 119 (below maximum)', () => expect(validate(119)).toBe(true));
  it('should accept age 120 (exact maximum)', () => expect(validate(120)).toBe(true));
  it('should reject age 121 (above maximum)', () => expect(validate(121)).toBe(false));

  // Edge cases
  it('should reject negative age',            () => expect(validate(-1)).toBe(false));
  it('should reject age 0',                   () => expect(validate(0)).toBe(false));
});
```

---

## 7. Snapshot Testing

For large output structures — catch unintended changes.

```typescript
// [PATTERN: Snapshot — use sparingly]
// Good for: serialised DTOs, HTML output, complex config objects
// Bad for: business logic assertions — use specific expect() instead

it('should render order confirmation email correctly', () => {
  const email = emailTemplates.orderConfirmation(OrderMother.default());
  expect(email).toMatchSnapshot(); // first run creates snapshot; subsequent runs compare
});

// [WARNING] Snapshots become stale — review them on every update
// Never approve a snapshot diff without reading it carefully
```

---

## Naming Conventions

| Language | Convention | Example |
|----------|-----------|---------|
| TypeScript/Jest | `it('should [outcome] when [condition]')` | `it('should reject order when user is inactive')` |
| Python/pytest | `test_[outcome]_when_[condition]` | `test_rejects_order_when_user_is_inactive` |
| Go | `Test[Unit]_[Scenario]_[Outcome]` | `TestOrderService_InactiveUser_RejectsOrder` |
| Java/JUnit | `[scenario]_[outcome]()` | `inactiveUser_rejectsOrder()` |
| Dart | `'[outcome] when [condition]'` | `'rejects order when user is inactive'` |
| Rust | `[outcome]_when_[condition]` | `rejects_order_when_user_is_inactive` |
