# TDD Guide — Red · Green · Refactor

Test-Driven Development is a design technique, not just a testing technique.
Writing the test first forces you to think about the API before the implementation.

---

## The Cycle

```
┌─────────────────────────────────────────────────────┐
│                                                     │
│   RED ──────→ GREEN ──────→ REFACTOR ──────┐        │
│    ↑                                       │        │
│    └───────────────────────────────────────┘        │
│                                                     │
│  RED     : Write a test for the next behaviour.     │
│            Run it. It MUST fail.                    │
│            If it passes without code → test is wrong│
│                                                     │
│  GREEN   : Write the MINIMUM code to make it pass.  │
│            Ugly code is fine here. No more.         │
│                                                     │
│  REFACTOR: Clean up code + tests.                   │
│            All tests must stay green.               │
└─────────────────────────────────────────────────────┘
```

---

## End-to-End Example — TypeScript (Jest)

We'll TDD a `PasswordValidator` from scratch.

### Iteration 1 — RED
```typescript
// [TDD: RED] — write test first, no implementation yet
describe('PasswordValidator', () => {
  it('should reject passwords shorter than 8 characters', () => {
    const validator = new PasswordValidator();
    const result = validator.validate('abc123');
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('Password must be at least 8 characters');
  });
});

// Run → FAILS: "PasswordValidator is not defined" ✓ (expected)
```

### Iteration 1 — GREEN
```typescript
// [TDD: GREEN] — minimum code to pass only this test
export class PasswordValidator {
  validate(password: string): ValidationResult {
    const errors: string[] = [];
    if (password.length < 8) errors.push('Password must be at least 8 characters');
    return { isValid: errors.length === 0, errors };
  }
}
// Run → PASSES ✓
```

### Iteration 2 — RED (next behaviour)
```typescript
it('should reject passwords without at least one number', () => {
  const validator = new PasswordValidator();
  const result = validator.validate('abcdefgh');  // 8 chars, no number
  expect(result.isValid).toBe(false);
  expect(result.errors).toContain('Password must contain at least one number');
});
// Run → FAILS ✓
```

### Iteration 2 — GREEN
```typescript
validate(password: string): ValidationResult {
  const errors: string[] = [];
  if (password.length < 8) errors.push('Password must be at least 8 characters');
  if (!/\d/.test(password)) errors.push('Password must contain at least one number');
  return { isValid: errors.length === 0, errors };
}
// Run → PASSES ✓
```

### Iteration 3 — RED
```typescript
it('should accept a valid password', () => {
  const validator = new PasswordValidator();
  const result = validator.validate('SecurePass1');
  expect(result.isValid).toBe(true);
  expect(result.errors).toHaveLength(0);
});
// Run → PASSES immediately ✓ (green without new code — good sign)
```

### Iteration 3 — REFACTOR
```typescript
// Tests look fine. Let's clean up the implementation.
export class PasswordValidator {
  private static readonly RULES: Array<[RegExp | null, number | null, string]> = [
    [null, 8, 'Password must be at least 8 characters'],
    [/\d/, null, 'Password must contain at least one number'],
  ];

  validate(password: string): ValidationResult {
    const errors = PasswordValidator.RULES
      .filter(([regex, minLen]) =>
        (minLen && password.length < minLen) ||
        (regex && !regex.test(password))
      )
      .map(([,, message]) => message);

    return { isValid: errors.length === 0, errors };
  }
}
// Run all tests → still PASS ✓
```

---

## End-to-End Example — Python (pytest)

```python
# [TDD: RED] — test first
def test_rejects_short_password():
    validator = PasswordValidator()
    result = validator.validate("abc123")
    assert not result.is_valid
    assert "Password must be at least 8 characters" in result.errors

# Run → FAILS: PasswordValidator not defined ✓

# [TDD: GREEN]
class ValidationResult:
    def __init__(self, errors: list[str]):
        self.errors = errors
        self.is_valid = len(errors) == 0

class PasswordValidator:
    def validate(self, password: str) -> ValidationResult:
        errors = []
        if len(password) < 8:
            errors.append("Password must be at least 8 characters")
        return ValidationResult(errors)

# Run → PASSES ✓

# [TDD: RED] — next rule
def test_rejects_password_without_number():
    validator = PasswordValidator()
    result = validator.validate("abcdefgh")
    assert not result.is_valid
    assert "Password must contain at least one number" in result.errors

# [TDD: GREEN]
def validate(self, password: str) -> ValidationResult:
    errors = []
    if len(password) < 8:
        errors.append("Password must be at least 8 characters")
    if not any(c.isdigit() for c in password):
        errors.append("Password must contain at least one number")
    return ValidationResult(errors)
```

---

## End-to-End Example — Go

```go
// [TDD: RED]
func TestPasswordValidator_RejectsShortPassword(t *testing.T) {
    v := NewPasswordValidator()
    result := v.Validate("abc123")
    if result.IsValid { t.Fatal("expected invalid, got valid") }
    if !containsError(result.Errors, "at least 8 characters") {
        t.Errorf("expected length error, got: %v", result.Errors)
    }
}
// go test → FAILS: NewPasswordValidator undefined ✓

// [TDD: GREEN]
type ValidationResult struct {
    IsValid bool
    Errors  []string
}

type PasswordValidator struct{}

func NewPasswordValidator() *PasswordValidator { return &PasswordValidator{} }

func (v *PasswordValidator) Validate(password string) ValidationResult {
    var errors []string
    if len(password) < 8 {
        errors = append(errors, "Password must be at least 8 characters")
    }
    return ValidationResult{IsValid: len(errors) == 0, Errors: errors}
}
// go test → PASSES ✓
```

---

## TDD Anti-Patterns

### Writing Tests After the Code
```
// [ANTI-PATTERN: TDD violation — test written after implementation]
// Symptoms:
// - Tests only verify what the code already does
// - No test ever caught a real bug
// - Coverage is high but confidence is low
// Fix: For new code, delete the implementation and TDD it properly.
```

### Testing Implementation Details
```typescript
// [ANTI-PATTERN: Testing private method]
it('should call _formatDate internally', () => {
  const spy = jest.spyOn(service as any, '_formatDate');
  service.processOrder(order);
  expect(spy).toHaveBeenCalled(); // breaks on any rename/refactor
});

// [FIX: Test observable behaviour]
it('should include formatted date in order confirmation', () => {
  const result = service.processOrder(order);
  expect(result.confirmationDate).toMatch(/\d{4}-\d{2}-\d{2}/);
});
```

### Test That Never Fails
```typescript
// [ANTI-PATTERN: Test that always passes — never caught a bug]
it('should process order', () => {
  const result = service.processOrder(order);
  expect(result).toBeDefined(); // this passes even if result = null
});

// [FIX: Assert specific expected values]
it('should return PENDING status for new order', () => {
  const result = service.processOrder(newOrder);
  expect(result.status).toBe('PENDING');
  expect(result.id).toMatch(/^ord_/);
  expect(result.total).toBe(Money.of(99.99, 'INR'));
});
```

### Skipping RED
```
// [ANTI-PATTERN: Writing GREEN code before RED test]
// You don't know if the test actually catches the failure.
// Always run the test before writing the implementation.
// If the test passes without implementation → the test is wrong.
```
