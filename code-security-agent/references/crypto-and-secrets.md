# Cryptographic Failures & Secrets Management

Covers OWASP A02 (Cryptographic Failures). The goal: sensitive data is unreadable
to anyone without the right key, and keys/secrets never end up where they shouldn't.

---

## 1. Secrets Must Never Be Hardcoded

### The Vulnerability Pattern
```typescript
// [VULNERABLE] — credentials committed to source control
const stripeKey = 'sk_live_51H8x...';
const dbPassword = 'P@ssw0rd123';
const jwtSecret = 'my-secret-key';
```

### The Fix
```typescript
// [SEC: secrets] — loaded from environment, validated at startup
const config = {
  stripeKey:  requireEnv('STRIPE_SECRET_KEY'),
  dbPassword: requireEnv('DB_PASSWORD'),
  jwtSecret:  requireEnv('JWT_SECRET'),
};

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

// [SEC: secrets] — for production, prefer a secrets manager over plain env vars
// AWS Secrets Manager / HashiCorp Vault / GCP Secret Manager
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

async function getSecret(secretId: string): Promise<string> {
  const client = new SecretsManagerClient({});
  const response = await client.send(new GetSecretValueCommand({ SecretId: secretId }));
  return response.SecretString!;
}
```

```python
# [SEC: secrets] — Python: env vars validated at startup, never hardcoded
import os

def require_env(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        raise RuntimeError(f"Missing required env var: {name}")
    return value

STRIPE_KEY = require_env("STRIPE_SECRET_KEY")
```

### `.gitignore` and Pre-commit Hygiene
```bash
# [SEC: secrets] — .gitignore essentials
.env
.env.local
.env.*.local
*.pem
*.key
secrets/

# [SEC: secrets] — use a pre-commit secret scanner
# e.g. gitleaks, trufflehog, git-secrets — catches accidental commits before push
```

---

## 2. Secrets Must Never Be Logged

### The Vulnerability Pattern
```typescript
// [VULNERABLE] — full request object logged, including Authorization header and body
logger.info('Incoming request', { headers: req.headers, body: req.body });
// Authorization: Bearer <token> and password fields end up in log aggregators,
// which are often less access-controlled than the primary database

// [VULNERABLE] — error logging that includes sensitive context
logger.error('Login failed', { email, password, error }); // password in plaintext logs
```

### The Fix
```typescript
// [SEC: secrets] — redact sensitive fields before logging
const SENSITIVE_FIELDS = ['password', 'token', 'authorization', 'ssn', 'cardNumber', 'cvv'];

function redact(obj: Record<string, any>): Record<string, any> {
  const result = { ...obj };
  for (const key of Object.keys(result)) {
    if (SENSITIVE_FIELDS.some(f => key.toLowerCase().includes(f))) {
      result[key] = '[REDACTED]';
    }
  }
  return result;
}

logger.info('Incoming request', { headers: redact(req.headers), body: redact(req.body) });
logger.error('Login failed', { email, error: error.message }); // no password
```

```python
# [SEC: secrets] — Python structured logging with redaction
import logging

SENSITIVE_KEYS = {'password', 'token', 'authorization', 'ssn', 'card_number'}

def redact(data: dict) -> dict:
    return {
        k: '[REDACTED]' if k.lower() in SENSITIVE_KEYS else v
        for k, v in data.items()
    }

logger.info("Login attempt", extra=redact({"email": email, "password": password}))
```

---

## 3. Encryption at Rest

```typescript
// [SEC: crypto] — encrypting sensitive fields before storage (e.g. PII, payment details)
import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY = Buffer.from(requireEnv('ENCRYPTION_KEY'), 'hex'); // 32 bytes, from a vault

function encrypt(plaintext: string): { ciphertext: string; iv: string; authTag: string } {
  const iv = crypto.randomBytes(12); // unique IV per encryption — never reuse
  const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return {
    ciphertext: ciphertext.toString('hex'),
    iv: iv.toString('hex'),
    authTag: cipher.getAuthTag().toString('hex'),
  };
}

function decrypt(ciphertext: string, iv: string, authTag: string): string {
  const decipher = crypto.createDecipheriv(ALGORITHM, KEY, Buffer.from(iv, 'hex'));
  decipher.setAuthTag(Buffer.from(authTag, 'hex'));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertext, 'hex')),
    decipher.final(),
  ]);
  return plaintext.toString('utf8');
}

// [SEC: crypto] — AES-GCM gives both confidentiality AND integrity (authenticated encryption)
// Never use ECB mode; never reuse an IV with the same key
```

```python
# [SEC: crypto] — Python: cryptography library, Fernet for simple authenticated encryption
from cryptography.fernet import Fernet

key = require_env("ENCRYPTION_KEY").encode()  # 32-byte url-safe base64 key
f = Fernet(key)

ciphertext = f.encrypt(plaintext.encode())   # authenticated encryption, built-in
plaintext = f.decrypt(ciphertext).decode()
```

### Rule
Use established libraries' authenticated encryption modes (AES-GCM, Fernet) —
never roll a custom cipher or use ECB mode. Keys come from a vault or KMS, not
from application config files.

---

## 4. Encryption in Transit

```typescript
// [SEC: crypto] — enforce HTTPS, reject plaintext HTTP in production
app.use((req, res, next) => {
  if (process.env.NODE_ENV === 'production' && req.headers['x-forwarded-proto'] !== 'https') {
    return res.redirect(301, `https://${req.headers.host}${req.url}`);
  }
  next();
});

// [SEC: crypto] — HSTS header forces browsers to use HTTPS even if user types http://
app.use((req, res, next) => {
  res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  next();
});

// [SEC: crypto] — never disable TLS certificate verification, even in development debugging
// VULNERABLE:
// process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'; // never do this, even temporarily
```

---

## 5. Sensitive Data Exposure in API Responses

```typescript
// [VULNERABLE] — returning the entire user object, including hash and internal fields
app.get('/api/me', authenticate, async (req, res) => {
  const user = await db.user.findUnique({ where: { id: req.user.id } });
  res.json(user); // includes passwordHash, internal flags, etc.
});

// [SEC: secrets] — explicit response shape — allow-list fields, never return the raw model
interface UserResponseDTO {
  id: string;
  email: string;
  name: string;
  createdAt: Date;
  // deliberately excludes: passwordHash, internalNotes, etc.
}

function toUserDTO(user: User): UserResponseDTO {
  return { id: user.id, email: user.email, name: user.name, createdAt: user.createdAt };
}

app.get('/api/me', authenticate, async (req, res) => {
  const user = await db.user.findUnique({ where: { id: req.user.id } });
  res.json(toUserDTO(user)); // only allow-listed fields leave the server
});
```

### Rule
Never serialize a raw database model directly into an HTTP response. Always
map to an explicit DTO that allow-lists which fields are exposed — this also
prevents accidentally leaking a new sensitive column added to the model later.

---

## 6. Random Number Generation

```typescript
// [VULNERABLE] — Math.random() is not cryptographically secure
const resetToken = Math.random().toString(36).substring(2); // predictable, guessable

// [SEC: crypto] — cryptographically secure random generation
import crypto from 'crypto';
const resetToken = crypto.randomBytes(32).toString('hex'); // unpredictable
```

```python
# [VULNERABLE] — Python random module is not cryptographically secure
import random
token = str(random.randint(100000, 999999))

# [SEC: crypto] — use secrets module for anything security-sensitive
import secrets
token = secrets.token_urlsafe(32)
```

### Rule
Use `crypto.randomBytes` (Node), `secrets` module (Python), `crypto/rand`
(Go) — never `Math.random()`, `random` module, or `math/rand` — for tokens,
password reset codes, session IDs, or anything where unpredictability matters.

---

## Crypto & Secrets Checklist

```
[ ] No hardcoded credentials, API keys, or secrets in source code
[ ] .env files in .gitignore; pre-commit secret scanner configured
[ ] Secrets loaded from env/vault, validated present at startup
[ ] Logging redacts password/token/authorization/PII fields
[ ] Passwords hashed with bcrypt/argon2 — never reversible encryption
[ ] Sensitive data at rest encrypted with authenticated encryption (AES-GCM)
[ ] HTTPS enforced; HSTS header set; TLS verification never disabled
[ ] API responses use explicit DTOs — never serialize raw DB models
[ ] Tokens/random values use crypto-secure RNG, never Math.random()/random module
[ ] Encryption keys rotated periodically; key rotation plan documented
```
