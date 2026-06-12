# Test Review Template

Use in **REVIEW mode** — auditing existing tests for quality, coverage, and correctness.

---

## Severity Definitions

| Severity | Meaning |
|----------|---------|
| `CRITICAL` | Test gives false confidence — passes when it should fail |
| `MAJOR` | Test is brittle, untestable, or misses core behaviours |
| `MINOR` | Naming, structure, or readability issues |
| `SUGGESTION` | Optional improvement |

---

## Review Checklist

```
TEST FILE AUDIT
═══════════════════════════════════════
File: ____________________

STRUCTURE
[ ] AAA pattern applied consistently
[ ] No logic (if/for/switch) inside test bodies
[ ] One conceptual assertion per test
[ ] beforeEach resets all state — no shared mutation

NAMING
[ ] Test names describe behaviour, not implementation
[ ] Failure message is clear from the test name alone
[ ] follows: should_[outcome]_when_[condition]

TEST DOUBLES
[ ] Correct double used (Mock/Stub/Spy/Fake/Dummy)
[ ] No over-mocking of value objects
[ ] Fakes used for repositories and event buses
[ ] Mocks only for side-effect verification

COVERAGE QUALITY
[ ] Happy path covered
[ ] Sad path / error cases covered
[ ] Boundary values tested
[ ] Edge cases (empty, null, zero, max) covered

RELIABILITY
[ ] No Date.now() / Math.random() in unit tests
[ ] No network calls in unit tests
[ ] Tests are order-independent
[ ] Tests are deterministic on every run
```

---

## Full Review Report

```
═══════════════════════════════════════════════
TEST REVIEW REPORT
═══════════════════════════════════════════════
File(s) reviewed : ____________________
Reviewed by      : Testing Agent
Language         : ____________________
Framework        : ____________________
───────────────────────────────────────────────

SUMMARY
───────
Test health     : HEALTHY / NEEDS WORK / CRITICAL
Total tests     : X
AAA compliance  : X/X tests structured correctly
Naming issues   : X found
Double misuse   : X found
Missing coverage: X scenarios

───────────────────────────────────────────────
FINDINGS
───────────────────────────────────────────────

[TEST-001] <CRITICAL/MAJOR/MINOR/SUGGESTION>
Location  : <describe/it block or test name>
Issue     : <what is wrong>
Fix       : <specific actionable fix>

───────────────────────────────────────────────
MISSING TEST SCENARIOS
───────────────────────────────────────────────
[ ] <scenario not covered>
[ ] <boundary not tested>
[ ] <error case not tested>

───────────────────────────────────────────────
VERDICT
───────────────────────────────────────────────
[ ] APPROVE     — clean tests, good coverage
[ ] APPROVE*    — minor issues; safe to merge
[ ] CHANGES     — MAJOR issues; fix before merge
[ ] BLOCK       — CRITICAL issues; false confidence
═══════════════════════════════════════════════
```

---

## Example Review

```
═══════════════════════════════════════════════
TEST REVIEW REPORT
═══════════════════════════════════════════════
File(s) reviewed : order-service.test.ts
Language         : TypeScript
Framework        : Jest
───────────────────────────────────────────────

SUMMARY
───────
Test health     : NEEDS WORK
Total tests     : 6
AAA compliance  : 4/6
Naming issues   : 3 found
Double misuse   : 1 found
Missing coverage: 3 scenarios

───────────────────────────────────────────────
FINDINGS
───────────────────────────────────────────────

[TEST-001] CRITICAL
Location  : 'should work' (line 12)
Issue     : Test name gives no information. Test only checks
            that result is defined — passes even if result = null
            due to expect(result).toBeDefined() on an object that
            is always truthy.
Fix       : Rename to 'should return PENDING status for new order'.
            Assert specific fields: status, id format, total.

[TEST-002] MAJOR
Location  : 'should process order' (line 24)
Issue     : if (user.isPremium) inside test body — conditional
            assertion hides the case where isPremium=false.
            Two behaviours need two tests.
Fix       : Split into:
            'should apply 20% discount when user is premium'
            'should apply no discount when user is basic'

[TEST-003] MAJOR
Location  : beforeAll (line 3)
Issue     : Shared mutable orderRepo across all tests. Test 4
            depends on Test 2 having run first.
Fix       : Move to beforeEach. Each test gets a fresh repo.

[TEST-004] MINOR
Location  : All test names
Issue     : Names describe implementation ('calls save method')
            not behaviour ('persists order to storage').
Fix       : Rename to describe observable outcomes.

[TEST-005] SUGGESTION
Location  : emailService mock (line 45)
Issue     : Mock used where Fake would be cleaner.
            FakeEmailService captures sent emails without
            requiring expect().toHaveBeenCalledWith() syntax.
Fix       : Optional — replace mock with FakeEmailService.

───────────────────────────────────────────────
MISSING TEST SCENARIOS
───────────────────────────────────────────────
[ ] Order placement with empty items array
[ ] Order placement when payment service throws
[ ] Concurrent order placement for same user (race condition)

───────────────────────────────────────────────
VERDICT
───────────────────────────────────────────────
[ ] APPROVE
[ ] APPROVE*
[x] CHANGES  — TEST-001 gives false confidence; TEST-003 causes flaky tests
[ ] BLOCK
═══════════════════════════════════════════════
```
