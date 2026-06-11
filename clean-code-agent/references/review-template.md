# Code Review Report Template

Use this template when in **REVIEW mode** — auditing existing code against GoF, SOLID, YAGNI, and DRY.

---

## How to Use

1. Read the code under review
2. Run through each section of this template
3. Assign a severity to each finding: `CRITICAL` | `MAJOR` | `MINOR` | `SUGGESTION`
4. Produce the **Review Report** at the end
5. Optionally produce a **Refactored Version** of the code

---

## Severity Definitions

| Severity | Meaning | Action Required |
|----------|---------|----------------|
| `CRITICAL` | Will cause bugs, security issues, or system failure | Fix before merge |
| `MAJOR` | Significant design problem; creates tech debt | Fix in same sprint |
| `MINOR` | Violates a principle but low immediate impact | Fix when touching this code next |
| `SUGGESTION` | Could be improved; subjective | Optional improvement |

---

## Section 1 — SOLID Violations

For each class/module in the code, check:

```
CLASS: <ClassName>
─────────────────────────────────
SRP  [ ] PASS  [ ] VIOLATION — <describe what extra responsibility it has>
OCP  [ ] PASS  [ ] VIOLATION — <describe what would require modifying this class>
LSP  [ ] PASS  [ ] VIOLATION — <describe which subclass breaks the contract>
ISP  [ ] PASS  [ ] VIOLATION — <describe which interface methods are unused>
DIP  [ ] PASS  [ ] VIOLATION — <describe which concrete dependency is hardcoded>
```

---

## Section 2 — GoF Pattern Opportunities

For each pattern opportunity spotted:

```
PATTERN OPPORTUNITY
───────────────────
Pattern:   <Factory / Strategy / Observer / etc.>
Location:  <file:line or method name>
Signal:    <what code smell triggered this — e.g., "switch on type", "5 direct listeners">
Severity:  <CRITICAL / MAJOR / MINOR / SUGGESTION>
Fix:       <brief description of how to apply the pattern>
```

---

## Section 3 — DRY Violations

```
DRY VIOLATION
─────────────
Type:      <Logic / Business Rule / Magic Value / Data Transformation>
Locations: <file:line, file:line>
Severity:  <CRITICAL / MAJOR / MINOR>
Fix:       <extract to function/constant/class — name suggestion>
```

---

## Section 4 — YAGNI Violations

```
YAGNI FLAG
──────────
Location:  <file:line or method/class name>
Issue:     <what is over-engineered or speculative>
Severity:  <MAJOR / MINOR / SUGGESTION>
Action:    <REMOVE / FLAG with [YAGNI-WARN] / EXCEPTION — reason>
```

---

## Full Review Report Format

```
═══════════════════════════════════════════════
CODE REVIEW REPORT
═══════════════════════════════════════════════
File(s) reviewed : <filenames>
Reviewed by      : Clean Code Agent
Date             : <date>
Language         : <TypeScript / Python / Go / etc.>
───────────────────────────────────────────────

SUMMARY
───────
Overall health : HEALTHY / NEEDS WORK / CRITICAL
SOLID score    : X/5 principles clean
DRY issues     : X found
YAGNI issues   : X found
Pattern opps   : X identified

───────────────────────────────────────────────
FINDINGS
───────────────────────────────────────────────

[FINDING-001] <CRITICAL/MAJOR/MINOR/SUGGESTION>
Principle : <SOLID:SRP / DRY / YAGNI / GoF:Strategy / etc.>
Location  : <ClassName.methodName or file:line>
Issue     : <clear description of the problem>
Fix       : <specific actionable fix>

[FINDING-002] ...

───────────────────────────────────────────────
REFACTORED CODE (if applicable)
───────────────────────────────────────────────
<refactored version with Decision Comments inline>

───────────────────────────────────────────────
VERDICT
───────────────────────────────────────────────
[ ] APPROVE     — clean, no significant issues
[ ] APPROVE*    — minor issues noted; fine to merge
[ ] CHANGES     — MAJOR issues found; fix before merge
[ ] BLOCK       — CRITICAL issues; do not merge
═══════════════════════════════════════════════
```

---

## Example Review Report

```
═══════════════════════════════════════════════
CODE REVIEW REPORT
═══════════════════════════════════════════════
File(s) reviewed : order-service.ts
Reviewed by      : Clean Code Agent
Language         : TypeScript
───────────────────────────────────────────────

SUMMARY
───────
Overall health : NEEDS WORK
SOLID score    : 2/5 principles clean (SRP, OCP violated)
DRY issues     : 2 found
YAGNI issues   : 1 found
Pattern opps   : 1 identified (Strategy)

───────────────────────────────────────────────
FINDINGS
───────────────────────────────────────────────

[FINDING-001] MAJOR
Principle : SOLID:SRP
Location  : OrderService
Issue     : OrderService handles order creation, payment processing,
            email notifications, and inventory update — 4 responsibilities.
            Each has an independent reason to change.
Fix       : Extract PaymentService, NotificationService, InventoryService.
            OrderService orchestrates only.

[FINDING-002] MAJOR
Principle : GoF:Strategy
Location  : OrderService.calculateDiscount()
Issue     : 4-branch if/else on discount type. Adding a 5th type
            requires modifying OrderService — OCP violation too.
Fix       : Create DiscountStrategy interface; implement
            PercentageDiscount, FlatDiscount, LoyaltyDiscount.
            Inject strategy; remove if/else chain.

[FINDING-003] MINOR
Principle : DRY
Location  : OrderService.ts:34 and InvoiceService.ts:67
Issue     : formatCurrency() logic copy-pasted in both files.
Fix       : Extract to shared utils/currency.ts → formatCurrency(amount, currency).

[FINDING-004] MINOR
Principle : DRY — Magic Value
Location  : OrderService.ts:12, 45, 89
Issue     : Literal '0.18' (GST rate) hardcoded in 3 places.
Fix       : const GST_RATE = 0.18; in constants/tax.ts

[FINDING-005] SUGGESTION
Principle : YAGNI
Location  : OrderService.pluginRegistry (lines 100–134)
Issue     : Plugin registry system with 0 registered plugins.
            No current requirement for extensibility.
Fix       : Remove. Add back when a second plugin actually exists.
            Tag: [YAGNI]

───────────────────────────────────────────────
VERDICT
───────────────────────────────────────────────
[ ] APPROVE
[ ] APPROVE*
[x] CHANGES  — FINDING-001 and FINDING-002 are MAJOR; fix before merge
[ ] BLOCK
═══════════════════════════════════════════════
```

---

## Quick Review Checklist (Fast Mode)

For smaller code reviews, use this condensed version:

```
QUICK REVIEW — <FileName>
══════════════════════════
SOLID
  SRP  [ ] clean  [!] issue: _______________
  OCP  [ ] clean  [!] issue: _______________
  LSP  [ ] clean  [!] issue: _______________
  ISP  [ ] clean  [!] issue: _______________
  DIP  [ ] clean  [!] issue: _______________

DRY
  [ ] No duplication found
  [!] Found: _______________

YAGNI
  [ ] No speculative code found
  [!] Found: _______________

PATTERNS
  [ ] No missed pattern opportunities
  [!] Consider: _______________

VERDICT: APPROVE / APPROVE* / CHANGES / BLOCK
```
