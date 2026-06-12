# TypeScript — Language-Specific Clean Code Guide

Patterns, idioms, and pitfalls specific to TypeScript. Apply these on top of the
base GoF/SOLID/YAGNI/DRY rules whenever writing TypeScript code.

---

## 1. Type System — Use It as a Design Tool

TypeScript's type system is not just documentation — it enforces correctness at compile time.
Use it aggressively to make illegal states unrepresentable.

### Branded / Nominal Types (prevent primitive confusion)
```typescript
// [ANTI-PATTERN: Primitive Obsession — userId and orderId are both string]
function getOrder(userId: string, orderId: string) { ... }
getOrder(orderId, userId); // compiles — wrong! ← silent bug

// [FIX: Branded Types — different types, same runtime representation]
type UserId  = string & { readonly _brand: 'UserId' };
type OrderId = string & { readonly _brand: 'OrderId' };

const toUserId  = (id: string): UserId  => id as UserId;
const toOrderId = (id: string): OrderId => id as OrderId;

function getOrder(userId: UserId, orderId: OrderId) { ... }
getOrder(toOrderId(id), toUserId(id)); // compile error ← caught!
```

### Discriminated Unions (model state machines)
```typescript
// [ANTI-PATTERN: boolean flags for state]
interface Order {
  isPending: boolean;
  isFulfilled: boolean;
  isCancelled: boolean;  // can all be true simultaneously — impossible state!
  cancelReason?: string;
}

// [FIX: Discriminated Union — only valid states are expressible]
type Order =
  | { status: 'pending';   createdAt: Date }
  | { status: 'fulfilled'; fulfilledAt: Date; trackingId: string }
  | { status: 'cancelled'; cancelledAt: Date; reason: string };

// Exhaustive switch — compiler catches missing cases
function describeOrder(order: Order): string {
  switch (order.status) {
    case 'pending':   return `Pending since ${order.createdAt}`;
    case 'fulfilled': return `Shipped: ${order.trackingId}`;
    case 'cancelled': return `Cancelled: ${order.reason}`;
    // No default needed — compiler guarantees exhaustiveness
  }
}
```

### Template Literal Types (enforce string formats)
```typescript
// [FIX: Compile-time string format enforcement]
type EventName = `on${Capitalize<string>}`;  // must start with 'on'
type CSSUnit   = `${number}${'px' | 'rem' | 'em' | '%'}`;
type ApiRoute  = `/api/v${1 | 2}/${string}`;

const route: ApiRoute = '/api/v1/users';  // ✓
const bad:   ApiRoute = '/users';         // compile error ✓
```

---

## 2. Generics — DRY at the Type Level

```typescript
// [ANTI-PATTERN: DRY violation at type level — same shape, different types]
interface UserResponse  { data: User;    error: string | null; loading: boolean; }
interface OrderResponse { data: Order;   error: string | null; loading: boolean; }
interface PostResponse  { data: Post;    error: string | null; loading: boolean; }

// [FIX: Generic — one definition, infinite reuse]
interface ApiResponse<T> { data: T; error: string | null; loading: boolean; }

type UserResponse  = ApiResponse<User>;
type OrderResponse = ApiResponse<Order>;

// Generic Repository — [PATTERN: Template Method at type level]
interface Repository<T, ID> {
  findById(id: ID): Promise<T | null>;
  save(entity: T): Promise<T>;
  delete(id: ID): Promise<void>;
  findAll(): Promise<T[]>;
}

class UserRepository implements Repository<User, UserId> {
  async findById(id: UserId): Promise<User | null> { ... }
  async save(user: User): Promise<User> { ... }
  async delete(id: UserId): Promise<void> { ... }
  async findAll(): Promise<User[]> { ... }
}
```

---

## 3. Async — Avoid Common Pitfalls

```typescript
// [ANTI-PATTERN: Sequential awaits — 3 independent calls take 3x longer]
const user    = await fetchUser(id);     // 200ms
const orders  = await fetchOrders(id);   // 200ms — waits for user needlessly
const reviews = await fetchReviews(id);  // 200ms — waits for orders needlessly
// Total: ~600ms

// [FIX: Parallel execution]
const [user, orders, reviews] = await Promise.all([
  fetchUser(id),
  fetchOrders(id),
  fetchReviews(id),
]);
// Total: ~200ms

// [ANTI-PATTERN: Unhandled promise rejections]
fetchUser(id).then(user => processUser(user)); // rejection silently swallowed

// [FIX: Always handle rejections]
try {
  const user = await fetchUser(id);
  await processUser(user);
} catch (error) {
  logger.error('Failed to process user', { id, error });
  throw error; // re-throw unless you're intentionally suppressing
}

// [ANTI-PATTERN: async in constructor]
class UserService {
  constructor() {
    this.init(); // fire-and-forget — no way to await or catch errors
  }
  private async init() { this.config = await loadConfig(); }
}

// [FIX: Static factory method]
class UserService {
  private constructor(private config: Config) {}
  static async create(): Promise<UserService> {
    const config = await loadConfig();
    return new UserService(config);
  }
}
const service = await UserService.create();
```

---

## 4. Decorators — Cross-Cutting Concerns

```typescript
// [PATTERN: Decorator — apply logging/validation/caching without polluting business logic]

// Logging decorator
function log(target: any, key: string, descriptor: PropertyDescriptor) {
  const original = descriptor.value;
  descriptor.value = async function (...args: any[]) {
    console.log(`[${key}] called with`, args);
    const result = await original.apply(this, args);
    console.log(`[${key}] returned`, result);
    return result;
  };
  return descriptor;
}

// Retry decorator
function retry(attempts: number, delayMs: number) {
  return function (target: any, key: string, descriptor: PropertyDescriptor) {
    const original = descriptor.value;
    descriptor.value = async function (...args: any[]) {
      for (let i = 0; i < attempts; i++) {
        try { return await original.apply(this, args); }
        catch (e) {
          if (i === attempts - 1) throw e;
          await new Promise(r => setTimeout(r, delayMs));
        }
      }
    };
    return descriptor;
  };
}

class PaymentService {
  @log
  @retry(3, 1000)
  async charge(amount: Money): Promise<Receipt> { ... }
}
```

---

## 5. Null Safety — Eliminate Undefined Behavior

```typescript
// [ANTI-PATTERN: optional chaining abuse — masks design problems]
const city = user?.address?.location?.city?.name?.toLowerCase();
// If this chain is this long, the object graph is wrong

// [FIX: Null Object Pattern for common cases]
class NullAddress implements Address {
  city = 'Unknown';
  street = '';
  zip = '';
}

// [FIX: Result type instead of null returns]
type Result<T, E = Error> =
  | { ok: true;  value: T }
  | { ok: false; error: E };

async function findUser(id: UserId): Promise<Result<User, 'NOT_FOUND' | 'DB_ERROR'>> {
  try {
    const user = await db.users.findOne(id);
    if (!user) return { ok: false, error: 'NOT_FOUND' };
    return { ok: true, value: user };
  } catch {
    return { ok: false, error: 'DB_ERROR' };
  }
}

// Caller is forced to handle both cases
const result = await findUser(id);
if (!result.ok) {
  if (result.error === 'NOT_FOUND') return res.status(404).json({ message: 'User not found' });
  return res.status(500).json({ message: 'Internal error' });
}
const user = result.value; // TypeScript knows this is User here
```

---

## 6. Module Design — Barrel Exports & Boundaries

```typescript
// [FIX: Barrel exports — control what each module exposes]
// features/users/index.ts — public API of the module
export { UserService }   from './UserService';
export { UserRepository } from './UserRepository';
export type { User, UserId, CreateUserDTO } from './types';
// Internal: UserValidator, UserMapper — NOT exported (internal implementation)

// [ANTI-PATTERN: Deep imports — bypasses module boundaries]
import { UserValidator } from '../../features/users/internal/UserValidator'; // ❌

// [FIX: Only import from barrel]
import { UserService } from '../../features/users'; // ✓
```

---

## TypeScript Quick Checklist

```
[ ] Branded types for IDs — no raw string/number as identifiers
[ ] Discriminated unions for state — no boolean flag combos
[ ] Generics for repeated shapes — no copy-paste interfaces
[ ] Promise.all for independent async calls — no sequential awaits
[ ] Result<T, E> for expected failures — no null returns from queries
[ ] Barrel exports — no deep internal imports across module boundaries
[ ] Exhaustive switch on discriminated unions — no default: throw
```
