# Vulnerable Components & Security Misconfiguration

Covers OWASP A05 (Security Misconfiguration) and A06 (Vulnerable & Outdated Components).
Most breaches don't come from exotic zero-days — they come from default configs,
unpatched dependencies, and unnecessary exposed surface area.

---

## 1. Dependency Management

```bash
# [SEC: dependency] — audit dependencies regularly, not just at setup
npm audit                  # Node — lists known CVEs in dependency tree
npm audit fix               # auto-fix where a safe patch version exists
pip-audit                   # Python equivalent
govulncheck ./...           # Go equivalent
mvn dependency-check:check  # Java (OWASP Dependency-Check plugin)
```

```yaml
# [SEC: dependency] — automate dependency scanning in CI
# .github/workflows/security.yml
name: Security Audit
on: [push, pull_request]
jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm audit --audit-level=high  # fail CI on high/critical CVEs
      - uses: github/codeql-action/analyze@v3  # static analysis for code-level vulns
```

```json
// [SEC: dependency] — pin exact versions in production; avoid uncontrolled drift
// package.json — use exact versions or tight ranges for critical dependencies
{
  "dependencies": {
    "express": "4.19.2",      // exact — predictable, auditable
    "lodash": "^4.17.21"      // caret only for well-maintained, low-risk packages
  }
}
```

### Rule
Run dependency audits in CI on every PR, not just manually. Subscribe to
security advisories for your core framework. Update dependencies on a
schedule (e.g. monthly), not only when a CVE is announced — staying close
to current reduces the blast radius of any single disclosure.

---

## 2. Security Headers

```typescript
// [SEC: dependency] — use a maintained library rather than hand-rolling headers
import helmet from 'helmet';
app.use(helmet());
// Sets: X-Content-Type-Options, X-Frame-Options, Strict-Transport-Security,
// Content-Security-Policy (basic), X-DNS-Prefetch-Control, and more

// [SEC: dependency] — explicit configuration when defaults aren't enough
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"], // clickjacking protection
    },
  },
  hsts: { maxAge: 63072000, includeSubDomains: true, preload: true },
}));
```

```python
# [SEC: dependency] — Python/FastAPI equivalent via middleware
from starlette.middleware.base import BaseHTTPMiddleware

class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains"
        return response

app.add_middleware(SecurityHeadersMiddleware)
```

### Header Reference

| Header | Purpose |
|--------|---------|
| `Content-Security-Policy` | Restricts script/style/resource sources — primary XSS mitigation |
| `X-Content-Type-Options: nosniff` | Prevents MIME-sniffing attacks |
| `X-Frame-Options: DENY` | Prevents clickjacking via iframe embedding |
| `Strict-Transport-Security` | Forces HTTPS for future requests |
| `Referrer-Policy` | Limits what's sent in the Referer header to other sites |
| `Permissions-Policy` | Disables unused browser features (camera, geolocation, etc.) |

---

## 3. Default Credentials & Debug Endpoints

```typescript
// [VULNERABLE] — debug/admin endpoints left enabled in production
app.get('/debug/env', (req, res) => res.json(process.env)); // leaks all secrets
app.get('/.well-known/health', (req, res) => res.json({ db: dbConfig })); // leaks config

// [SEC: dependency] — gate debug routes behind environment checks AND auth
if (process.env.NODE_ENV !== 'production') {
  app.get('/debug/routes', authenticate, requireRole('admin'), debugHandler);
}

// [SEC: dependency] — never ship default credentials; force change on first run
// Database/admin seed scripts should generate random credentials, not use
// well-known defaults like admin/admin or root/root
```

### Rule
Audit every route before deploying: does this need to exist in production?
Frameworks' default scaffolding (admin panels, debug toolbars, GraphQL
introspection, API docs like Swagger UI) are common sources of accidental
exposure — disable or auth-gate them outside development.

---

## 4. Error Handling — Don't Leak Internals

```typescript
// [VULNERABLE] — stack traces and internal details returned to the client
app.use((err, req, res, next) => {
  res.status(500).json({ error: err.message, stack: err.stack }); // leaks file paths, library versions, query structure
});

// [SEC: dependency] — generic external message, detailed internal logging
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  const errorId = crypto.randomUUID();
  logger.error('Unhandled error', { errorId, message: err.message, stack: err.stack }); // full detail server-side only

  res.status(500).json({
    error: 'An unexpected error occurred',
    errorId, // support can look this up in logs without exposing internals to the client
  });
});
```

```python
# [SEC: dependency] — FastAPI: disable debug/auto-reload details in production
app = FastAPI(debug=False)  # debug=True exposes stack traces in HTTP responses

@app.exception_handler(Exception)
async def generic_exception_handler(request, exc):
    error_id = str(uuid.uuid4())
    logger.error(f"Unhandled error {error_id}", exc_info=exc)
    return JSONResponse(status_code=500, content={"error": "Internal error", "error_id": error_id})
```

---

## 5. CORS Misconfiguration

```typescript
// [VULNERABLE] — reflecting any origin, with credentials allowed
app.use(cors({ origin: true, credentials: true }));
// Any website can make authenticated requests on behalf of a logged-in user

// [VULNERABLE] — wildcard with credentials (browsers actually reject this combo,
// but the intent reveals a misunderstanding worth flagging in review)
app.use(cors({ origin: '*', credentials: true }));

// [SEC: dependency] — explicit allow-list of trusted origins
const ALLOWED_ORIGINS = ['https://app.example.com', 'https://admin.example.com'];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || ALLOWED_ORIGINS.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
}));
```

### Rule
`credentials: true` combined with a permissive origin policy effectively
disables the browser's same-origin protections for authenticated requests.
Always use an explicit allow-list when credentials are involved.

---

## 6. Container & Deployment Hardening

```dockerfile
# [SEC: dependency] — run as non-root user
FROM node:20-slim
RUN addgroup --system appgroup && adduser --system --ingroup appgroup appuser
WORKDIR /app
COPY --chown=appuser:appgroup . .
USER appuser   # never run the container process as root
CMD ["node", "server.js"]

# [SEC: dependency] — pin base image to a digest, not just a tag, for reproducibility
# FROM node:20-slim@sha256:<digest>

# [SEC: dependency] — multi-stage builds keep secrets/build tools out of the final image
FROM node:20 AS builder
COPY . .
RUN npm ci && npm run build

FROM node:20-slim
COPY --from=builder /app/dist ./dist
# build-time secrets, dev dependencies, and source maps never reach the runtime image
```

```yaml
# [SEC: dependency] — Kubernetes: avoid privileged containers, set resource limits
securityContext:
  runAsNonRoot: true
  readOnlyRootFilesystem: true
  allowPrivilegeEscalation: false
resources:
  limits:
    memory: "512Mi"
    cpu: "500m"
```

---

## Security Configuration Checklist

```
[ ] Dependency audit runs in CI on every PR; fails build on high/critical CVEs
[ ] Security headers set via a maintained library (helmet or equivalent)
[ ] CSP configured with explicit allow-lists, not 'unsafe-inline'/'unsafe-eval'
[ ] Debug routes, admin panels, API docs gated behind auth in production
[ ] Error responses generic to clients; full detail logged server-side with a trace ID
[ ] CORS uses explicit origin allow-list when credentials are involved
[ ] Containers run as non-root user with read-only root filesystem where possible
[ ] Secrets never baked into container images — injected at runtime
[ ] Default credentials changed/randomized on all services (DB, admin panels, message queues)
```
