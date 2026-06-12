# Python — Language-Specific Clean Code Guide

Pythonic patterns, idioms, and pitfalls. Apply these on top of base GoF/SOLID/YAGNI/DRY rules.

---

## 1. Pythonic Idioms — Write Python, Not Java

```python
# [ANTI-PATTERN: Non-Pythonic — Java-style Python]
result = []
for i in range(len(items)):
    if items[i].active:
        result.append(items[i].name.upper())

# [FIX: Pythonic — list comprehension]
result = [item.name.upper() for item in items if item.active]

# [ANTI-PATTERN: Manual index tracking]
for i in range(len(items)):
    print(f"{i}: {items[i]}")

# [FIX: enumerate]
for i, item in enumerate(items):
    print(f"{i}: {item}")

# [ANTI-PATTERN: Manual zip]
for i in range(len(names)):
    print(names[i], ages[i])

# [FIX: zip]
for name, age in zip(names, ages):
    print(name, age)

# [ANTI-PATTERN: Key existence check before access]
if 'count' in data:
    count = data['count']
else:
    count = 0

# [FIX: dict.get with default]
count = data.get('count', 0)
```

---

## 2. Type Hints — Use as Design Tool

```python
from typing import Optional, Union, TypeVar, Generic, Protocol
from collections.abc import Sequence, Callable

# [FIX: NewType for branded primitives — catches semantic errors]
from typing import NewType
UserId  = NewType('UserId', str)
OrderId = NewType('OrderId', str)

def get_order(user_id: UserId, order_id: OrderId) -> Order: ...

# [FIX: TypeVar for generic functions]
T = TypeVar('T')

def first(items: Sequence[T]) -> Optional[T]:
    return items[0] if items else None

# [FIX: Protocol for structural typing — duck typing with type safety]
class Serializable(Protocol):
    def to_dict(self) -> dict: ...

def serialize(obj: Serializable) -> str:
    return json.dumps(obj.to_dict())
# Any class with to_dict() satisfies this — no inheritance needed

# [FIX: TypedDict for dict shapes]
from typing import TypedDict

class UserDTO(TypedDict):
    id: str
    name: str
    email: str
    age: int

# [FIX: Literal for constrained strings]
from typing import Literal
Status = Literal['pending', 'fulfilled', 'cancelled']

def update_status(order_id: OrderId, status: Status) -> None: ...
```

---

## 3. Dataclasses & Value Objects

```python
from dataclasses import dataclass, field
from decimal import Decimal

# [FIX: Dataclass for value objects — replaces boilerplate __init__, __eq__, __repr__]
@dataclass(frozen=True)  # frozen=True → immutable value object
class Money:
    amount: Decimal
    currency: str

    def __post_init__(self):
        if self.amount < 0:
            raise ValueError('Amount cannot be negative')
        if len(self.currency) != 3:
            raise ValueError('Currency must be 3-letter ISO code')

    def __add__(self, other: 'Money') -> 'Money':
        if self.currency != other.currency:
            raise ValueError(f'Cannot add {self.currency} and {other.currency}')
        return Money(self.amount + other.amount, self.currency)

@dataclass(frozen=True)
class Email:
    value: str
    def __post_init__(self):
        if '@' not in self.value:
            raise ValueError(f'Invalid email: {self.value}')

# [FIX: Dataclass with default_factory for mutable defaults]
@dataclass
class Order:
    id: str
    items: list['OrderItem'] = field(default_factory=list)  # NOT items=[] ← shared reference bug
    metadata: dict = field(default_factory=dict)
```

---

## 4. Abstract Base Classes — DIP in Python

```python
from abc import ABC, abstractmethod

# [FIX: ABC for DIP — depend on abstractions]
class NotificationService(ABC):
    @abstractmethod
    def send(self, recipient: str, message: str) -> None: ...

class EmailNotificationService(NotificationService):
    def send(self, recipient: str, message: str) -> None:
        # send email
        ...

class SMSNotificationService(NotificationService):
    def send(self, recipient: str, message: str) -> None:
        # send SMS
        ...

class OrderService:
    def __init__(self, notifier: NotificationService):  # injected abstraction
        self._notifier = notifier

    def place_order(self, order: Order) -> None:
        # ...business logic
        self._notifier.send(order.user.email, f'Order {order.id} confirmed')
```

---

## 5. Context Managers — Resource Safety

```python
# [ANTI-PATTERN: Manual resource management]
conn = get_db_connection()
try:
    result = conn.execute(query)
    conn.commit()
except Exception:
    conn.rollback()
    raise
finally:
    conn.close()

# [FIX: Context manager — RAII pattern in Python]
from contextlib import contextmanager

@contextmanager
def transaction(conn: Connection):
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()

with transaction(get_db_connection()) as conn:
    conn.execute(query)

# [FIX: Custom context manager class]
class ManagedCache:
    def __enter__(self):
        self.cache = connect_cache()
        return self.cache

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.cache.flush()
        self.cache.close()
        return False  # don't suppress exceptions
```

---

## 6. Generators — Memory-Efficient Pipelines

```python
# [ANTI-PATTERN: Loading entire dataset into memory]
def get_active_users() -> list[User]:
    return [u for u in db.query('SELECT * FROM users') if u.is_active]
# 1M users → 1M objects in RAM

# [FIX: Generator — lazy evaluation, O(1) memory]
def get_active_users():
    for row in db.query('SELECT * FROM users WHERE active = true'):
        yield User.from_row(row)

# [FIX: Generator pipeline — compose transformations]
def process_large_file(path: str):
    def read_lines(path):
        with open(path) as f:
            yield from f

    def parse_json(lines):
        for line in lines:
            yield json.loads(line)

    def filter_valid(records):
        for record in records:
            if record.get('status') == 'active':
                yield record

    pipeline = filter_valid(parse_json(read_lines(path)))
    for record in pipeline:
        process(record)  # only one record in memory at a time
```

---

## 7. Exception Design

```python
# [ANTI-PATTERN: Catching broad Exception]
try:
    result = process(data)
except Exception:  # catches everything — hides bugs
    return None

# [ANTI-PATTERN: Using exceptions for flow control]
try:
    value = my_dict[key]
except KeyError:
    value = default  # use .get() instead

# [FIX: Domain-specific exception hierarchy]
class AppError(Exception):
    """Base for all application errors"""

class ValidationError(AppError):
    def __init__(self, field: str, message: str):
        self.field = field
        super().__init__(f'{field}: {message}')

class NotFoundError(AppError):
    def __init__(self, resource: str, id: str):
        super().__init__(f'{resource} with id={id} not found')

class PaymentError(AppError):
    pass

# [FIX: Catch specific, re-raise unknown]
try:
    order = order_repo.find(order_id)
except NotFoundError:
    return {'error': 'Order not found'}, 404
except PaymentError as e:
    logger.warning('Payment failed', exc_info=e)
    return {'error': str(e)}, 402
# Let unexpected errors propagate — don't swallow bugs
```

---

## 8. Dependency Injection — No Global State

```python
# [ANTI-PATTERN: Global state / module-level singletons]
db = Database(os.environ['DB_URL'])  # module-level — untestable

class UserRepository:
    def find(self, id: str) -> User:
        return db.query(...)  # hidden dependency on global

# [FIX: Inject dependencies explicitly]
class UserRepository:
    def __init__(self, db: Database):
        self._db = db

    def find(self, id: str) -> User:
        return self._db.query(...)

# Composition root (main.py / app factory):
def create_app() -> Flask:
    db = Database(os.environ['DB_URL'])
    user_repo = UserRepository(db)
    user_service = UserService(user_repo)
    return Flask(__name__)
```

---

## Python Quick Checklist

```
[ ] List comprehensions over for-loop + append
[ ] enumerate() over range(len())
[ ] Type hints on all public functions/methods
[ ] NewType for domain IDs — no raw str/int
[ ] dataclass(frozen=True) for value objects
[ ] ABC + @abstractmethod for interfaces (DIP)
[ ] Context managers for all resource cleanup
[ ] Generators for large data processing
[ ] Domain-specific exceptions — no bare except Exception
[ ] No module-level mutable state — inject dependencies
```
