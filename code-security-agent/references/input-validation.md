# Input Validation & Output Encoding

Covers OWASP A03 (Injection — XSS specifically), A08 (Software & Data Integrity
Failures — deserialization), and SSRF. The core principle: **validate on input,
encode on output, and treat the context where data lands as what determines
the encoding needed.**

---

## 1. Cross-Site Scripting (XSS)

### The Vulnerability Pattern
```typescript
// [VULNERABLE] — user input inserted into the DOM without encoding
element.innerHTML = `<div>${userComment}</div>`;
// userComment = '<img src=x onerror="...">' executes arbitrary script

// [VULNERABLE] — React's dangerouslySetInnerHTML with unsanitized input
<div dangerouslySetInnerHTML={{ __html: userComment }} />
```

### The Fix — Let the Framework Encode by Default
```typescript
// [SEC: input-validation] — React encodes text content automatically — use it
<div>{userComment}</div> // safe — React escapes this; no manual encoding needed

// [SEC: input-validation] — if raw HTML rendering is genuinely required, sanitize first
import DOMPurify from 'dompurify';

const clean = DOMPurify.sanitize(userComment, {
  ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a'], // explicit allow-list
  ALLOWED_ATTR: ['href'],
});
<div dangerouslySetInnerHTML={{ __html: clean }} />
```

```python
# [SEC: input-validation] — Jinja2 autoescapes by default — don't disable it
# templates/comment.html
# {{ user_comment }}  ← autoescaped, safe
# {{ user_comment | safe }}  ← VULNERABLE — bypasses escaping, only use for trusted content

from markupsafe import escape
safe_comment = escape(user_comment)  # manual escape when not using the template engine
```

### Content Security Policy — Defense in Depth
```typescript
// [SEC: input-validation] — CSP limits the damage even if XSS slips through
app.use((req, res, next) => {
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self'; object-src 'none'; base-uri 'self';"
  );
  next();
});
// Blocks inline scripts and scripts from unauthorized origins —
// a defense layer that limits XSS impact even if input validation has a gap
```

### Context-Aware Encoding
```typescript
// Different contexts need different encoding — one-size-fits-all is wrong

// [SEC: input-validation] — HTML body context
const htmlSafe = escapeHtml(userInput); // &, <, >, ", ' encoded

// [SEC: input-validation] — URL parameter context
const urlSafe = encodeURIComponent(userInput);

// [SEC: input-validation] — inside a <script> block — avoid entirely if possible;
// if unavoidable, JSON-encode and never directly interpolate
const script = `<script>const data = ${JSON.stringify(userInput)};</script>`;

// [SEC: input-validation] — HTML attribute context (often missed)
// <div data-user="${userInput}"> needs attribute encoding, not just HTML body encoding
const attrSafe = userInput.replace(/"/g, '&quot;');
```

---

## 2. Server-Side Request Forgery (SSRF)

### The Vulnerability Pattern
```typescript
// [VULNERABLE] — server fetches a URL supplied entirely by the user
app.post('/api/fetch-preview', async (req, res) => {
  const response = await fetch(req.body.url); // could target internal services
  res.json(await response.json());
  // req.body.url = "http://169.254.169.254/latest/meta-data/" reaches cloud
  // instance metadata — or http://localhost:6379 reaches internal Redis
});
```

### The Fix
```typescript
import dns from 'dns/promises';
import net from 'net';

// [SEC: ssrf] — allow-list of permitted destination hosts
const ALLOWED_HOSTS = new Set(['api.trusted-partner.com', 'cdn.example.com']);

// [SEC: ssrf] — block private/internal IP ranges, including after DNS resolution
function isPrivateIP(ip: string): boolean {
  return /^(10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip)
    || ip === '::1' || ip.startsWith('fc00:') || ip.startsWith('fe80:');
}

async function validateFetchUrl(urlString: string): Promise<URL> {
  const url = new URL(urlString);

  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new BadRequestError('Only http/https URLs allowed');
  }
  if (!ALLOWED_HOSTS.has(url.hostname)) {
    throw new BadRequestError('Destination host not allowed');
  }

  // [SEC: ssrf] — resolve DNS and check the actual IP, not just the hostname string
  // (prevents DNS rebinding attacks where a domain resolves to a private IP)
  const { address } = await dns.lookup(url.hostname);
  if (isPrivateIP(address)) {
    throw new BadRequestError('Resolved IP is not allowed');
  }

  return url;
}

app.post('/api/fetch-preview', async (req, res) => {
  const url = await validateFetchUrl(req.body.url); // throws if not allowed
  const response = await fetch(url.toString(), {
    redirect: 'manual', // [SEC: ssrf] don't auto-follow redirects to bypass the check
  });
  res.json(await response.json());
});
```

### Rule
Outbound requests built from user input are the most under-protected attack
surface in most apps. Always: (1) allow-list destinations when possible,
(2) resolve and check the IP — not just the hostname — for private ranges,
(3) disable automatic redirect-following, (4) set a timeout.

---

## 3. Insecure Deserialization

### The Vulnerability Pattern
```python
# [VULNERABLE] — pickle deserializes arbitrary objects, including malicious ones
import pickle
data = pickle.loads(untrusted_bytes)  # can execute arbitrary code during unpickling

# [VULNERABLE] — eval() on user-controlled data
config = eval(user_supplied_string)  # executes arbitrary Python
```

```typescript
// [VULNERABLE] — Node's vm module without sandboxing, or eval on user input
eval(userSuppliedCode); // never run arbitrary input as code
const fn = new Function(userInput); // equally dangerous
```

### The Fix — Schema-Validated Parsing, Not Generic Deserialization
```python
# [SEC: deserialization] — JSON + schema validation instead of pickle
import json
from pydantic import BaseModel, ValidationError

class ConfigSchema(BaseModel):
    name: str
    max_retries: int
    timeout_seconds: float

def load_config(raw_bytes: bytes) -> ConfigSchema:
    data = json.loads(raw_bytes)       # JSON parsing — data only, never code execution
    return ConfigSchema(**data)        # schema enforces types and structure
```

```typescript
// [SEC: deserialization] — JSON.parse + schema validation (zod)
import { z } from 'zod';

const ConfigSchema = z.object({
  name: z.string(),
  maxRetries: z.number().int().min(0),
  timeoutSeconds: z.number().positive(),
});

function loadConfig(raw: string) {
  const data = JSON.parse(raw);       // structural parsing only — never executes code
  return ConfigSchema.parse(data);    // throws if shape doesn't match
}
```

### Rule
Never use a deserialization format that can execute code (`pickle`, `eval`,
`unserialize` in PHP, Java native serialization of untrusted streams). Use
JSON, Protocol Buffers, or similar data-only formats, and validate the
resulting structure against an explicit schema before trusting it.

---

## 4. File Upload Validation

### The Vulnerability Pattern
```typescript
// [VULNERABLE] — no validation on file type, size, or content
app.post('/upload', upload.single('file'), (req, res) => {
  fs.writeFileSync(`/var/uploads/${req.file.originalname}`, req.file.buffer);
  // - originalname could be "../../etc/cron.d/malicious" (path traversal)
  // - no size limit (DoS via huge files)
  // - no type check (could upload a .php/.jsp file to a web-served directory)
});
```

### The Fix
```typescript
import path from 'path';
import { fileTypeFromBuffer } from 'file-type'; // checks actual content, not just extension

const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

app.post('/upload', upload.single('file'), async (req, res) => {
  const file = req.file;

  // [SEC: input-validation] — size limit enforced (also configure at the multer/proxy level)
  if (file.size > MAX_FILE_SIZE) {
    return res.status(400).json({ error: 'File too large' });
  }

  // [SEC: input-validation] — verify ACTUAL content type, not the client-supplied
  // Content-Type header or filename extension, both of which are attacker-controlled
  const detected = await fileTypeFromBuffer(file.buffer);
  if (!detected || !ALLOWED_MIME_TYPES.has(detected.mime)) {
    return res.status(400).json({ error: 'Invalid file type' });
  }

  // [SEC: input-validation] — generate a new filename; never trust the original
  const safeFilename = `${crypto.randomUUID()}.${detected.ext}`;
  const uploadPath = path.join('/var/uploads', safeFilename);

  // [SEC: input-validation] — store outside the web root, or in object storage (S3),
  // and serve through an application route that re-validates access — never let
  // uploaded files be directly executable by the web server
  await fs.promises.writeFile(uploadPath, file.buffer);

  res.json({ filename: safeFilename });
});
```

### Rule
Validate file type by **inspecting actual file content** (magic bytes), not
the extension or client-supplied MIME type — both are trivially spoofed.
Generate server-side filenames. Store uploads outside any directory the web
server would execute as code, and ideally in dedicated object storage.

---

## 5. Mass Assignment

### The Vulnerability Pattern
```typescript
// [VULNERABLE] — entire request body spread directly into a DB update
app.put('/api/users/:id', authenticate, async (req, res) => {
  await db.user.update({
    where: { id: req.params.id },
    data: req.body, // attacker can include { "role": "admin" } or { "isVerified": true }
  });
});
```

### The Fix
```typescript
// [SEC: input-validation] — explicit allow-list of updatable fields
const UpdateProfileSchema = z.object({
  name: z.string().min(1).max(100),
  bio: z.string().max(500).optional(),
  // role, isVerified, isAdmin deliberately excluded — not user-settable
});

app.put('/api/users/:id', authenticate, async (req, res) => {
  if (req.params.id !== req.user.id) return res.status(403).end(); // [SEC: access-control]

  const data = UpdateProfileSchema.parse(req.body); // strips/rejects unexpected fields
  await db.user.update({ where: { id: req.user.id }, data });
});
```

### Rule
Never pass a raw request body into an ORM update/create call. Define an
explicit schema of which fields are user-settable — this is the same allow-list
principle applied to write operations, and it's the single most common cause
of privilege-escalation bugs in CRUD APIs.

---

## Input Validation Checklist

```
[ ] All user-facing output relies on framework auto-escaping (React/Jinja2/etc.)
[ ] Raw HTML rendering sanitized with an allow-list (DOMPurify or equivalent)
[ ] CSP header configured to limit damage from any XSS that slips through
[ ] Server-initiated requests to user-supplied URLs validated against an allow-list
[ ] Outbound fetch validates resolved IP, not just hostname (DNS rebinding)
[ ] No eval/pickle/native-deserialization of untrusted data — JSON + schema only
[ ] File uploads validated by content inspection, not extension/MIME header
[ ] Uploaded files renamed server-side; stored outside web-executable paths
[ ] Write endpoints use explicit allow-listed update schemas, never raw req.body
```
