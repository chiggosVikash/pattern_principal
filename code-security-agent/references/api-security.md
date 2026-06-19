# API Security Patterns

API-specific defensive patterns — rate limiting, request validation, and the
design choices that keep a public-facing API resilient against abuse.

---

## 1. Rate Limiting

```typescript
// [SEC: api] — tiered rate limiting by endpoint sensitivity
import rateLimit from 'express-rate-limit';

const standardLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100, // 100 requests per 15 min per IP — general API traffic
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5, // tighter limit for auth endpoints — brute force protection
});

const expensiveOpLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 3, // very tight for expensive operations (report generation, bulk export)
});

app.use('/api/', standardLimiter);
app.use('/api/auth/', authLimiter);
app.use('/api/reports/export', expensiveOpLimiter);

// [SEC: api] — rate limit by authenticated user, not just IP, for logged-in endpoints
// (prevents one compromised/shared IP from exhausting limits for everyone behind it,
// and prevents a single abusive authenticated user from being missed if behind a shared IP)
const userLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  keyGenerator: (req) => req.user?.id ?? req.ip,
});
```

```python
# [SEC: api] — FastAPI with slowapi
from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter

@app.post("/api/auth/login")
@limiter.limit("5/15minutes")
async def login(request: Request, credentials: LoginRequest):
    ...
```

### Rule
Rate limit by sensitivity tier, not a single global limit. Authentication,
password reset, and any expensive/bulk operation need much tighter limits
than general read endpoints. Combine IP-based and account-based limiting.

---

## 2. Input Validation at the API Boundary

```typescript
// [SEC: api] — validate the ENTIRE request shape before any handler logic runs
import { z } from 'zod';

const CreateOrderSchema = z.object({
  items: z.array(z.object({
    productId: z.string().uuid(),
    quantity: z.number().int().positive().max(100), // sane upper bound
  })).min(1).max(50), // prevent unbounded array DoS
  couponCode: z.string().max(20).optional(),
  shippingAddressId: z.string().uuid(),
});

function validateBody(schema: z.ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ error: 'Invalid request', details: result.error.issues });
    }
    req.body = result.data; // replace with parsed/coerced, validated data
    next();
  };
}

app.post('/api/orders', authenticate, validateBody(CreateOrderSchema), createOrderHandler);
```

### Rule
Validate request shape at the boundary, before any business logic executes —
including array length limits, numeric bounds, and string length limits.
Unbounded arrays/strings in request bodies are a common, easy-to-miss DoS vector.

---

## 3. Mass Assignment Prevention (API-Specific)

```typescript
// [SEC: api] — response DTOs prevent over-fetching just as request DTOs prevent over-posting
// (full pattern covered in crypto-and-secrets.md and input-validation.md —
//  this is the API-layer summary)

// Request side: explicit schema strips unexpected/sensitive fields
const UpdateOrderSchema = z.object({ status: z.enum(['cancelled']) }).strict();
// .strict() rejects requests containing any field not in the schema

// Response side: explicit DTO, never the raw model
function toOrderDTO(order: Order): OrderResponseDTO {
  return { id: order.id, status: order.status, total: order.total, createdAt: order.createdAt };
}
```

---

## 4. GraphQL-Specific Concerns

```typescript
// [SEC: api] — disable introspection and GraphiQL in production
const server = new ApolloServer({
  schema,
  introspection: process.env.NODE_ENV !== 'production', // hides schema from probing
  plugins: process.env.NODE_ENV === 'production'
    ? [ApolloServerPluginLandingPageDisabled()]
    : [],
});

// [SEC: api] — query depth limiting prevents deeply nested queries from causing resource exhaustion
import depthLimit from 'graphql-depth-limit';
const server = new ApolloServer({
  schema,
  validationRules: [depthLimit(7)], // reject queries nested deeper than 7 levels
});

// [SEC: api] — query complexity limiting prevents expensive queries (many nested lists)
import { createComplexityLimitRule } from 'graphql-validation-complexity';
const ComplexityLimitRule = createComplexityLimitRule(1000);

// [SEC: api] — every resolver still needs its own authorization check —
// GraphQL's flexible querying means access control can't only live at the route level
const resolvers = {
  Query: {
    order: async (_, { id }, context) => {
      const order = await db.order.findFirst({ where: { id, userId: context.user.id } }); // [SEC: access-control]
      if (!order) throw new GraphQLError('Not found', { extensions: { code: 'NOT_FOUND' } });
      return order;
    },
  },
};
```

---

## 5. Webhook Security

```typescript
// [VULNERABLE] — trusting webhook payloads without verifying the sender
app.post('/webhooks/stripe', async (req, res) => {
  await processPayment(req.body); // anyone who finds this URL can fake a payment event
});

// [SEC: api] — verify webhook signatures before processing
app.post('/webhooks/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  const signature = req.headers['stripe-signature'] as string;

  let event;
  try {
    event = stripe.webhooks.constructEvent(
      req.body,              // raw body — signature is computed over the unparsed bytes
      signature,
      process.env.STRIPE_WEBHOOK_SECRET! // [SEC: secrets]
    );
  } catch (err) {
    return res.status(400).send('Invalid signature'); // reject anything that doesn't verify
  }

  await processPayment(event); // only reaches here if the signature is valid
  res.status(200).end();
});

// [SEC: api] — idempotency: webhook providers retry on timeout; processing must be idempotent
async function processPayment(event: StripeEvent) {
  const existing = await db.processedWebhook.findUnique({ where: { eventId: event.id } });
  if (existing) return; // already processed — safe to ignore duplicate delivery

  await db.processedWebhook.create({ data: { eventId: event.id } });
  // ... actual processing
}
```

### Rule
Every webhook consumer must verify a cryptographic signature provided by the
sender (most providers offer this) before trusting the payload. Process the
raw body for signature verification — not body parsed and re-serialized,
since that can change byte-for-byte content and break signature matching.

---

## 6. API Versioning & Deprecation (Security Angle)

```typescript
// [SEC: api] — old API versions often accumulate unpatched vulnerabilities
// Deprecate explicitly, set a sunset date, monitor usage, and actually remove old versions

app.use('/api/v1/', (req, res, next) => {
  res.setHeader('Sunset', 'Sat, 31 Dec 2024 23:59:59 GMT'); // RFC 8594
  res.setHeader('Deprecation', 'true');
  logger.warn('Deprecated API v1 called', { path: req.path, ip: req.ip });
  next();
}, v1Router);
```

---

## API Security Checklist

```
[ ] Rate limiting tiered by endpoint sensitivity (auth tighter than general reads)
[ ] Rate limiting keyed by user ID for authenticated routes, not just IP
[ ] Every request body validated against an explicit schema at the boundary
[ ] Array/string lengths bounded in request schemas — no unbounded input
[ ] Request schemas use .strict() / equivalent to reject unexpected fields
[ ] Response DTOs allow-list fields — never serialize raw DB models
[ ] GraphQL: introspection disabled in production
[ ] GraphQL: query depth and complexity limits configured
[ ] GraphQL: authorization checked per-resolver, not just per-route
[ ] Webhooks: signature verified using the raw request body before processing
[ ] Webhook processing is idempotent (handles provider retries safely)
[ ] Deprecated API versions have a sunset date and are actually removed on schedule
```
