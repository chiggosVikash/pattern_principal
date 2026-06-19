# Authentication & Access Control

Covers OWASP A01 (Broken Access Control) and A07 (Identification & Authentication Failures).
The two questions every request must answer: **who are you?** (authentication) and
**are you allowed to do this?** (authorization) — and authorization must be checked
on every single request, not just at login.

---

## 1. Object-Level Authorization (IDOR Prevention)

**IDOR** (Insecure Direct Object Reference) — when an ID in a URL/request lets a user
access another user's data because ownership was never checked.

### The Vulnerability Pattern
```typescript
// [VULNERABLE] — any authenticated user can read any invoice by guessing the ID
app.get('/api/invoices/:id', authenticate, async (req, res) => {
  const invoice = await db.invoice.findUnique({ where: { id: req.params.id } });
  res.json(invoice); // no check that req.user owns this invoice
});
```

### The Fix
```typescript
// [SEC: access-control] — ownership verified as part of the query, not after
app.get('/api/invoices/:id', authenticate, async (req, res) => {
  const invoice = await db.invoice.findFirst({
    where: { id: req.params.id, userId: req.user.id }, // scoped to the requester
  });
  if (!invoice) return res.status(404).json({ error: 'Not found' }); // 404, not 403 — don't leak existence
  res.json(invoice);
});
```

```python
# [SEC: access-control] — Python/FastAPI equivalent
@app.get("/api/invoices/{invoice_id}")
async def get_invoice(invoice_id: str, current_user: User = Depends(get_current_user)):
    invoice = await db.invoice.find_first(
        where={"id": invoice_id, "user_id": current_user.id}  # scoped query
    )
    if not invoice:
        raise HTTPException(status_code=404, detail="Not found")
    return invoice
```

```go
// [SEC: access-control] — Go equivalent
func getInvoice(w http.ResponseWriter, r *http.Request) {
    userID := getCurrentUserID(r)
    invoiceID := chi.URLParam(r, "id")

    invoice, err := db.GetInvoice(invoiceID, userID) // query scoped by both IDs
    if err != nil || invoice == nil {
        http.Error(w, "Not found", http.StatusNotFound)
        return
    }
    json.NewEncoder(w).Encode(invoice)
}
```

### Rule
**Never trust an ID from the client to imply ownership.** Always include the
authenticated user's ID as part of the database query's WHERE clause — not as
a separate check performed after fetching the record (which is easy to forget
to add on a new endpoint, or to bypass via a different code path).

---

## 2. Function-Level Authorization (Privilege Escalation Prevention)

### The Vulnerability Pattern
```typescript
// [VULNERABLE] — endpoint exists but doesn't check the caller's role
app.delete('/api/users/:id', authenticate, async (req, res) => {
  await db.user.delete({ where: { id: req.params.id } });
  res.status(204).end();
  // Any logged-in user can delete any other user — no role check
});

// [VULNERABLE] — role check based on client-supplied data
app.post('/api/admin/settings', authenticate, async (req, res) => {
  if (req.body.role === 'admin') { // role taken from the REQUEST BODY — attacker controls this
    await updateSettings(req.body);
  }
});
```

### The Fix
```typescript
// [SEC: access-control] — role checked from the authenticated session, never from request body
function requireRole(role: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.user.role !== role) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    next();
  };
}

app.delete('/api/users/:id', authenticate, requireRole('admin'), async (req, res) => {
  await db.user.delete({ where: { id: req.params.id } });
  res.status(204).end();
});

// [SEC: access-control] — middleware applied consistently across all admin routes
const adminRouter = express.Router();
adminRouter.use(authenticate, requireRole('admin'));
adminRouter.post('/settings', updateSettingsHandler);
adminRouter.delete('/users/:id', deleteUserHandler);
app.use('/api/admin', adminRouter);
```

```python
# [SEC: access-control] — FastAPI dependency-based role check
def require_role(role: str):
    def checker(current_user: User = Depends(get_current_user)):
        if current_user.role != role:
            raise HTTPException(status_code=403, detail="Forbidden")
        return current_user
    return checker

@app.delete("/api/users/{user_id}")
async def delete_user(user_id: str, admin: User = Depends(require_role("admin"))):
    await db.user.delete(user_id)
```

### Rule
Authorization decisions must come from **server-side session/token state**,
never from any field the client can set in the request (body, query, headers).
Apply role checks as middleware/dependencies so new routes inherit protection
by default rather than requiring every developer to remember to add it.

---

## 3. Password Storage

### The Vulnerability Pattern
```typescript
// [VULNERABLE] — plaintext storage
await db.user.create({ data: { email, password } }); // never store raw passwords

// [VULNERABLE] — fast general-purpose hash (no salt, no work factor)
const hash = crypto.createHash('sha256').update(password).digest('hex');
// SHA-256 is fast — billions of guesses/sec on commodity hardware via rainbow tables
```

### The Fix
```typescript
// [SEC: crypto] — bcrypt: slow by design, automatic salting, tunable cost factor
import bcrypt from 'bcrypt';

const passwordHash = await bcrypt.hash(password, 12); // cost factor 12
await db.user.create({ data: { email, passwordHash } });

// Verification — constant-time comparison built into bcrypt.compare
const valid = await bcrypt.compare(submittedPassword, user.passwordHash);
```

```python
# [SEC: crypto] — Python: argon2 (OWASP's current recommendation) or bcrypt
from argon2 import PasswordHasher

ph = PasswordHasher()
password_hash = ph.hash(password)
# Verification
try:
    ph.verify(password_hash, submitted_password)
except VerifyMismatchError:
    raise InvalidCredentialsError()
```

```go
// [SEC: crypto] — Go bcrypt
hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
// Verification
err := bcrypt.CompareHashAndPassword(hash, []byte(submittedPassword))
```

### Rule
**Never** use MD5, SHA-1, or unsalted SHA-256 for passwords — they're designed
to be fast, which is the opposite of what you want for password hashing. Use
bcrypt (cost ≥ 12) or argon2id. Never write a custom hashing scheme.

---

## 4. Session Management

```typescript
// [SEC: access-control] — secure session cookie configuration
app.use(session({
  secret: process.env.SESSION_SECRET,  // [SEC: secrets] from env, never hardcoded
  cookie: {
    httpOnly: true,    // JS cannot read the cookie — mitigates XSS token theft
    secure: true,      // only sent over HTTPS
    sameSite: 'lax',   // mitigates CSRF
    maxAge: 1000 * 60 * 60 * 2, // 2 hour expiry
  },
  resave: false,
  saveUninitialized: false,
}));

// [SEC: access-control] — regenerate session ID on privilege change (login, role change)
// Prevents session fixation — an attacker who set a session ID before login
// cannot reuse it after the victim authenticates
app.post('/login', async (req, res) => {
  const user = await authenticate(req.body);
  req.session.regenerate((err) => {
    req.session.userId = user.id;
    res.json({ success: true });
  });
});

// [SEC: access-control] — invalidate session on logout, server-side
app.post('/logout', (req, res) => {
  req.session.destroy(() => res.status(204).end());
});
```

---

## 5. JWT Pitfalls

```typescript
// [VULNERABLE] — accepting the algorithm from the token header
// Some libraries historically let an attacker switch alg to "none" to skip verification
jwt.verify(token, secret); // some old library defaults are unsafe — always specify algorithms

// [SEC: access-control] — explicitly restrict accepted algorithms
jwt.verify(token, secret, { algorithms: ['HS256'] }); // attacker cannot downgrade to 'none'

// [VULNERABLE] — storing sensitive data in the JWT payload (it's base64, not encrypted)
const token = jwt.sign({ userId, role, ssn: user.ssn }, secret); // SSN is readable by anyone with the token

// [SEC: access-control] — JWT payload holds only non-sensitive identifiers
const token = jwt.sign({ userId: user.id, role: user.role }, secret, { expiresIn: '15m' });
// fetch sensitive data server-side using userId, never embed it in the token

// [SEC: access-control] — short-lived access tokens + refresh token rotation
// Access token: 15 min expiry. Refresh token: longer-lived, stored httpOnly, rotated on use.
```

---

## 6. Multi-Factor & Brute Force Protection

```typescript
// [SEC: access-control] — rate limit authentication endpoints specifically
import rateLimit from 'express-rate-limit';

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,                    // 5 attempts per window per IP
  message: 'Too many login attempts, try again later',
  standardHeaders: true,
});

app.post('/login', loginLimiter, loginHandler);

// [SEC: access-control] — account lockout after repeated failures (track per-account, not just per-IP)
async function checkLoginAttempts(userId: string) {
  const attempts = await redis.get(`login_attempts:${userId}`);
  if (attempts && parseInt(attempts) >= 5) {
    throw new TooManyAttemptsError('Account temporarily locked');
  }
}

// [SEC: access-control] — generic error messages — don't reveal whether email exists
// "Invalid email or password" — not "Email not found" or "Wrong password"
// Prevents account enumeration via differing error messages
```

---

## Authentication & Access Control Checklist

```
[ ] Every resource-fetching query is scoped to the authenticated user (no IDOR)
[ ] Role/permission checks read from server-side session/token, never request body
[ ] Authorization middleware applied at the router level — new routes inherit it
[ ] Passwords hashed with bcrypt (cost ≥ 12) or argon2id — never MD5/SHA/plaintext
[ ] Session cookies: httpOnly, secure, sameSite set
[ ] Session ID regenerated on login / privilege change
[ ] JWT: algorithms explicitly allow-listed; no sensitive data in payload
[ ] Login endpoint rate-limited per IP and per account
[ ] Generic error messages on auth failure — no account enumeration
[ ] 404 (not 403) returned for resources outside the user's scope, to avoid existence leaks
```
