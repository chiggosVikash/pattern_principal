# Security Review Template

Use in **REVIEW mode** — auditing existing code for vulnerabilities.
Findings are rated by severity and exploitability, mapped to OWASP Top 10 categories
where applicable.

---

## Severity Definitions

| Severity | Meaning | Example |
|----------|---------|---------|
| `CRITICAL` | Remotely exploitable, no auth required, full compromise/data breach | SQL injection on a public login form |
| `HIGH` | Significant impact, requires some precondition (valid session, specific role) | IDOR exposing other users' private data |
| `MEDIUM` | Limited impact or unusual conditions required | Missing rate limit on a low-value endpoint |
| `LOW` | Defense-in-depth gap, best-practice deviation | Missing security header |
| `INFO` | Hardening suggestion, no direct exploitability | Outdated but unaffected dependency |

---

## Review Checklist by Category

```
INJECTION
[ ] All DB queries parameterized — no string concatenation
[ ] Shell commands avoid shell interpretation (execFile/arg arrays)
[ ] File paths validated against directory traversal
[ ] Dynamic SQL identifiers (column/table names) allow-listed

ACCESS CONTROL
[ ] Object-level checks scope queries to the authenticated user (no IDOR)
[ ] Function-level role checks read from server-side session, not request body
[ ] Authorization applied consistently via middleware, not per-handler ad-hoc
[ ] 404 (not 403) returned for out-of-scope resources

AUTHENTICATION
[ ] Passwords hashed with bcrypt/argon2, appropriate cost factor
[ ] Session cookies: httpOnly, secure, sameSite configured
[ ] Session ID regenerated on login/privilege change
[ ] Login endpoint rate-limited; generic error messages (no enumeration)
[ ] JWT algorithms explicitly allow-listed; no sensitive data in payload

CRYPTO & SECRETS
[ ] No hardcoded credentials/keys in source
[ ] Secrets loaded from env/vault; .env in .gitignore
[ ] Logging redacts sensitive fields
[ ] Sensitive data at rest uses authenticated encryption (AES-GCM)
[ ] Crypto-secure RNG used for tokens (not Math.random())

INPUT VALIDATION
[ ] Output relies on framework auto-escaping; raw HTML sanitized if used
[ ] CSP header configured
[ ] Outbound fetches to user-supplied URLs validated (SSRF)
[ ] No eval/pickle/unsafe deserialization of untrusted data
[ ] File uploads validated by content, not extension; renamed server-side
[ ] Write endpoints use allow-listed schemas, not raw request body

CONFIGURATION
[ ] Dependency audit clean (no high/critical CVEs) or documented exceptions
[ ] Security headers present (helmet or equivalent)
[ ] Debug/admin routes gated behind auth in production
[ ] Error responses generic to client; detail logged server-side only
[ ] CORS uses explicit origin allow-list when credentials involved

API-SPECIFIC
[ ] Rate limiting present, tiered by endpoint sensitivity
[ ] Request schemas bound array/string lengths
[ ] Webhooks verify signature using raw body before processing
[ ] GraphQL (if used): introspection disabled in prod, depth/complexity limited
```

---

## Full Review Report

```
═══════════════════════════════════════════════
SECURITY REVIEW REPORT
═══════════════════════════════════════════════
Scope            : ____________________
Reviewed by      : Code Security Agent
Language/Stack   : ____________________
───────────────────────────────────────────────

SUMMARY
───────
Overall posture : HEALTHY / NEEDS WORK / CRITICAL RISK
Critical findings: X
High findings    : X
Medium findings  : X
Low findings     : X

───────────────────────────────────────────────
FINDINGS
───────────────────────────────────────────────

[SEC-001] <CRITICAL/HIGH/MEDIUM/LOW/INFO>
Category  : Injection / Access Control / Auth / Crypto / Input Validation / Config / API
OWASP     : <A01-A10 mapping if applicable>
Location  : <file:line or endpoint>
Issue     : <what is wrong — pattern, not exploit>
Impact    : <what an attacker could achieve>
Fix       : <specific actionable remediation with code reference>

───────────────────────────────────────────────
VERDICT
───────────────────────────────────────────────
[ ] APPROVE      — no significant issues found
[ ] APPROVE*     — LOW/INFO findings only; safe to ship, address when convenient
[ ] CHANGES      — HIGH/MEDIUM findings; fix before deploying to production
[ ] BLOCK        — CRITICAL findings; do not deploy until resolved
═══════════════════════════════════════════════
```

---

## Example Review

```
═══════════════════════════════════════════════
SECURITY REVIEW REPORT
═══════════════════════════════════════════════
Scope    : order-service API (orders.controller.ts, orders.service.ts)
Stack    : TypeScript / Express / Prisma / PostgreSQL
───────────────────────────────────────────────

SUMMARY
───────
Overall posture  : NEEDS WORK
Critical findings: 1
High findings    : 2
Medium findings  : 1
Low findings     : 2

───────────────────────────────────────────────
FINDINGS
───────────────────────────────────────────────

[SEC-001] CRITICAL
Category : Injection
OWASP    : A03:2021 - Injection
Location : orders.service.ts:42 — searchOrders()
Issue    : Search query built via string interpolation:
           `SELECT * FROM orders WHERE notes LIKE '%${searchTerm}%'`
Impact   : Full SQL injection — attacker-controlled searchTerm reaches the
           database as executable SQL syntax, not just data.
Fix      : Use a parameterized query:
           db.query('SELECT * FROM orders WHERE notes LIKE $1', [`%${searchTerm}%`])

[SEC-002] HIGH
Category : Access Control
OWASP    : A01:2021 - Broken Access Control
Location : orders.controller.ts:18 — GET /api/orders/:id
Issue    : Query fetches order by ID only — no check that the order belongs
           to the requesting user. Any authenticated user can read any
           order by guessing/incrementing IDs.
Impact   : Full IDOR — exposes all customers' order history, addresses,
           and totals to any logged-in user.
Fix      : Scope the query: findFirst({ where: { id, userId: req.user.id } })

[SEC-003] HIGH
Category : Crypto & Secrets
Location : config.ts:8
Issue    : Stripe secret key hardcoded as a string literal.
Impact   : Key is exposed to anyone with source access (including git
           history even if removed later); cannot be rotated without a
           code deploy.
Fix      : Load from process.env.STRIPE_SECRET_KEY, validated at startup.
           Rotate the exposed key immediately regardless of code fix.

[SEC-004] MEDIUM
Category : API
Location : orders.controller.ts — POST /api/orders
Issue    : No rate limiting on order creation endpoint.
Impact   : Could be abused for inventory-exhaustion or automated fraud
           attempts at high volume.
Fix      : Add per-user rate limit (e.g. 10 orders/minute) via express-rate-limit.

[SEC-005] LOW
Category : Configuration
Location : app.ts
Issue    : No security headers configured (no helmet middleware).
Fix      : app.use(helmet())

[SEC-006] LOW
Category : Crypto & Secrets
Location : logger.ts:15
Issue    : Request logging includes full headers object, which contains
           the Authorization header.
Fix      : Redact Authorization/Cookie headers before logging.

───────────────────────────────────────────────
VERDICT
───────────────────────────────────────────────
[ ] APPROVE
[ ] APPROVE*
[ ] CHANGES
[x] BLOCK — SEC-001 is remotely exploitable SQL injection; SEC-002 is a
            full IDOR exposing all customer data. Both must be fixed
            before this ships.
═══════════════════════════════════════════════
```
