# YAGNI & DRY Rules

Practical heuristics for avoiding over-engineering (YAGNI) and duplication (DRY).

---

## YAGNI — You Aren't Gonna Need It

> Don't build something until you actually need it. Future-proofing is a form of waste.

### The YAGNI Test

Before writing any code, ask:
1. **Is this required by a current, confirmed requirement?**
2. **Is a real user/stakeholder asking for this now?**
3. **Would removing this break anything in the current sprint?**

If all three are NO → **don't build it.**

---

### YAGNI Red Flags (always check for these)

| Red Flag | Example | Action |
|----------|---------|--------|
| "We might need this later" comment | `// might need caching here` | Remove the comment and the code |
| Generic plugin/hook system with 0 plugins | `EventBus` with no listeners | Remove until a second listener exists |
| Abstract base class with one concrete impl | `AbstractPaymentProcessor` → only `StripeProcessor` | Flatten to concrete class |
| Config flags that are never toggled | `FEATURE_FLAG_NEW_ALGO = false` (never true) | Remove the flag and dead branch |
| Over-parameterized functions | `sendEmail(to, cc, bcc, replyTo, priority, template, locale, ...)` | Only add params when a real use case needs them |
| Pre-emptive pagination on 10-row datasets | `findAll(page, pageSize)` on a lookup table | Simple `findAll()` until scale demands it |
| Deeply nested abstractions for one use case | Strategy → Factory → Builder for one algorithm | Write the algorithm directly |

---

### YAGNI Exceptions (keep it even without current need)

These are **pragmatic exceptions** — YAGNI doesn't mean blind:

1. **Testability** — An interface that only has one production impl is still worth it if it makes unit testing possible without mocks.
2. **Open/Closed compliance** — An extension point required by OCP is not YAGNI — it's design.
3. **Contractual API** — If external clients depend on it, backward compatibility is a real need.
4. **Security boundaries** — Don't defer auth/authz — build it correctly from the start.

When keeping code for pragmatic reasons, annotate it:
```
// [YAGNI-EXCEPTION: testability] — interface enables mock injection in tests
// [YAGNI-EXCEPTION: OCP] — extension point for future report formats per spec
```

---

### YAGNI Annotation System

```
[YAGNI]            — code removed; was not required by current spec
[YAGNI-WARN]       — kept but flagged; should be removed if spec doesn't expand
[YAGNI-EXCEPTION]  — kept intentionally; reason stated
```

---

## DRY — Don't Repeat Yourself

> Every piece of knowledge should have a single, authoritative representation in the system.

### The DRY Test

Before committing any code, scan for:
1. **Identical or near-identical logic blocks** appearing 2+ times
2. **The same business rule** expressed in multiple places
3. **Hard-coded values** (strings, numbers) used in multiple places
4. **Copy-pasted data transformation** logic

---

### DRY Violation Types & Fixes

#### Type 1: Duplicated Logic
```typescript
// ❌ DRY VIOLATION — email validation repeated in 3 places
class UserService {
  register(email: string) {
    if (!email.includes('@') || email.length < 5) throw new Error('Invalid email');
    ...
  }
}
class InviteService {
  sendInvite(email: string) {
    if (!email.includes('@') || email.length < 5) throw new Error('Invalid email'); // ← copy
    ...
  }
}

// ✅ [DRY] — extracted to single validator
function validateEmail(email: string): void {
  if (!email.includes('@') || email.length < 5) throw new Error('Invalid email');
}
```

```python
# ✅ [DRY] — Python equivalent
def validate_email(email: str) -> None:
    if '@' not in email or len(email) < 5:
        raise ValueError('Invalid email')
```

```go
// ✅ [DRY] — Go equivalent
func validateEmail(email string) error {
    if !strings.Contains(email, "@") || len(email) < 5 {
        return errors.New("invalid email")
    }
    return nil
}
```

---

#### Type 2: Duplicated Business Rules
```typescript
// ❌ DRY VIOLATION — "premium user" rule defined in 3 places
// In dashboard: if (user.plan === 'premium' || user.plan === 'enterprise')
// In billing:   if (user.plan !== 'free' && user.plan !== 'trial')
// In features:  if (['premium','enterprise'].includes(user.plan))

// ✅ [DRY] — business rule lives in one place
class User {
  isPremium(): boolean {
    return this.plan === 'premium' || this.plan === 'enterprise';
  }
}
```

```python
# ✅ [DRY] — Python: business rule as a property
from enum import Enum

class Plan(Enum):
    FREE = 'free'
    TRIAL = 'trial'
    PREMIUM = 'premium'
    ENTERPRISE = 'enterprise'

class User:
    @property
    def is_premium(self) -> bool:
        return self.plan in (Plan.PREMIUM, Plan.ENTERPRISE)
```

---

#### Type 3: Magic Numbers & Strings
```typescript
// ❌ DRY VIOLATION — magic number in multiple places
if (retries > 3) { ... }
setTimeout(fn, 3000);
// if max retries change, must hunt for all 3s

// ✅ [DRY] — single source of truth
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 3000;

if (retries > MAX_RETRIES) { ... }
setTimeout(fn, RETRY_DELAY_MS);
```

```rust
// ✅ [DRY] — Rust constants
const MAX_RETRIES: u32 = 3;
const RETRY_DELAY_MS: u64 = 3000;
```

```go
// ✅ [DRY] — Go constants
const (
    MaxRetries   = 3
    RetryDelayMs = 3000
)
```

---

#### Type 4: Duplicated Data Transformation
```typescript
// ❌ DRY VIOLATION — user-to-DTO mapping written twice
// In UserController:
const dto = { id: user.id, name: `${user.firstName} ${user.lastName}`, email: user.email };
// In AdminController (copy):
const dto = { id: user.id, name: `${user.firstName} ${user.lastName}`, email: user.email };

// ✅ [DRY] — extracted mapper
function toUserDTO(user: User): UserDTO {
  return { id: user.id, name: `${user.firstName} ${user.lastName}`, email: user.email };
}
```

```java
// ✅ [DRY] — Java mapper class
class UserMapper {
    public static UserDTO toDTO(User user) {
        return new UserDTO(user.getId(), user.getFirstName() + " " + user.getLastName(), user.getEmail());
    }
}
```

---

### DRY ≠ Every Similarity Must Be Merged

**Important distinction:** DRY is about knowledge duplication, not syntactic similarity.

```typescript
// These look similar but should NOT be merged — different semantics
function validateUserAge(age: number): boolean {
  return age >= 18;  // legal requirement
}

function validateProductMinAge(age: number): boolean {
  return age >= 18;  // product restriction (may change independently)
}

// If merged into validateAge(n) → a change to one requirement silently breaks the other
// [DRY-NOTE: similar syntax, different knowledge — keep separate]
```

---

### DRY Extraction Decision Guide

```
Two code blocks look similar. Should I extract?

  Are they expressing the SAME business rule/knowledge?
  ├─ YES → Extract. They should change together.
  └─ NO  → Keep separate. They only look alike by coincidence.

  Would a change to the rule need to change BOTH?
  ├─ YES → Extract.
  └─ NO  → Probably coincidental similarity. Keep separate.

  Is the shared logic complex enough to warrant a function?
  ├─ YES (>2 lines of real logic) → Extract.
  └─ NO (single expression) → Inline is fine; don't over-abstract.
```

---

## Combined YAGNI + DRY Quick Scan

Before finishing a code block, run this 60-second scan:

```
YAGNI SCAN
[ ] Any code without a current requirement backing it?
[ ] Any abstraction layers with only one concrete usage?
[ ] Any config flags or feature toggles that are always one value?
[ ] Any TODO/might-need-later comments? → delete or implement now

DRY SCAN
[ ] Any logic block appearing 2+ times? → extract
[ ] Any business rule expressed in 2+ places? → centralize
[ ] Any magic numbers/strings used in 2+ places? → constant
[ ] Any data transformation duplicated? → extract mapper/transformer
```
