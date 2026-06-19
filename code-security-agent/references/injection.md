# Injection Prevention

Injection occurs when untrusted input is interpreted as code/commands instead of data.
The fix is always the same shape: **separate data from the interpreter** via
parameterization, or escape/encode for the specific context.

---

## 1. SQL Injection

### The Vulnerability Pattern
```typescript
// [VULNERABLE] — string concatenation lets input change query structure
const user = await db.query(
  `SELECT * FROM users WHERE email = '${email}' AND password = '${password}'`
);
// Input controlling the email field can alter what the query does —
// because the string becomes part of the SQL itself, not a data value.
```

### The Fix — Parameterized Queries
```typescript
// [SEC: injection] — parameterized query; input is always treated as data
const user = await db.query(
  'SELECT * FROM users WHERE email = $1',
  [email]
);
// Driver sends query structure and values separately — input can never
// change the query's meaning, regardless of its content.
```

```python
# [SEC: injection] — Python parameterized query
cursor.execute(
    "SELECT * FROM users WHERE email = %s",
    (email,)
)
# NEVER: cursor.execute(f"SELECT * FROM users WHERE email = '{email}'")
```

```go
// [SEC: injection] — Go parameterized query
row := db.QueryRow("SELECT * FROM users WHERE email = $1", email)
// NEVER: db.Query(fmt.Sprintf("SELECT * FROM users WHERE email = '%s'", email))
```

```java
// [SEC: injection] — Java PreparedStatement
PreparedStatement stmt = conn.prepareStatement(
    "SELECT * FROM users WHERE email = ?"
);
stmt.setString(1, email);
// NEVER: Statement.execute("SELECT * FROM users WHERE email = '" + email + "'")
```

### ORM Usage — Safe by Default, But Watch for Raw Escape Hatches
```typescript
// [SEC: injection] — ORM query builders parameterize automatically
const user = await prisma.user.findFirst({ where: { email } });        // safe
const users = await knex('users').where('email', email);                // safe

// [VULNERABLE] — raw query escape hatches bypass ORM protection
await prisma.$queryRawUnsafe(`SELECT * FROM users WHERE email = '${email}'`); // unsafe!
await knex.raw(`SELECT * FROM users WHERE email = '${email}'`);               // unsafe!

// [SEC: injection] — if raw SQL is unavoidable, use tagged templates / parameter binding
await prisma.$queryRaw`SELECT * FROM users WHERE email = ${email}`;     // safe — Prisma binds this
await knex.raw('SELECT * FROM users WHERE email = ?', [email]);          // safe — bound parameter
```

### Dynamic Identifiers (Table/Column Names)
```typescript
// [VULNERABLE] — parameterization doesn't work for identifiers (table/column names)
const sortColumn = req.query.sort; // user input
await db.query(`SELECT * FROM orders ORDER BY ${sortColumn}`); // injectable

// [SEC: injection] — allow-list validation for identifiers
const ALLOWED_SORT_COLUMNS = new Set(['created_at', 'total', 'status']);
if (!ALLOWED_SORT_COLUMNS.has(sortColumn)) {
  throw new BadRequestError('Invalid sort column');
}
await db.query(`SELECT * FROM orders ORDER BY ${sortColumn}`); // now safe — only known-good values reach the string
```

---

## 2. NoSQL Injection

### The Vulnerability Pattern
```typescript
// [VULNERABLE] — MongoDB operator injection via unvalidated input
// If req.body.password is { "$ne": null } instead of a string,
// the query becomes "password not equal to null" — bypasses auth
const user = await db.collection('users').findOne({
  email: req.body.email,
  password: req.body.password,  // could be an object, not a string
});
```

### The Fix
```typescript
// [SEC: injection] — enforce expected types before querying
import { z } from 'zod';

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),  // rejects objects, arrays, operators
});

const { email, password } = LoginSchema.parse(req.body); // throws on shape mismatch
const user = await db.collection('users').findOne({ email });
const valid = await bcrypt.compare(password, user.passwordHash); // [SEC: crypto]

// [SEC: injection] — alternative: explicit sanitization library
import { mongoSanitize } from 'express-mongo-sanitize';
app.use(mongoSanitize()); // strips $ and . from keys in req.body/query/params
```

```python
# [SEC: injection] — Python: validate types before building Mongo query
from pydantic import BaseModel, EmailStr

class LoginRequest(BaseModel):
    email: EmailStr
    password: str  # pydantic rejects non-string types automatically

def login(payload: dict):
    data = LoginRequest(**payload)  # raises on invalid shape
    user = db.users.find_one({"email": data.email})
    # compare password hash separately — never put password in the query filter
```

---

## 3. Command Injection

### The Vulnerability Pattern
```typescript
// [VULNERABLE] — user input reaches a shell interpreter
const { exec } = require('child_process');
exec(`convert ${filename} output.png`); // filename could contain shell metacharacters
```

### The Fix — Avoid the Shell Entirely
```typescript
// [SEC: injection] — execFile bypasses shell interpretation; args are not parsed as shell syntax
import { execFile } from 'child_process';
execFile('convert', [filename, 'output.png'], (err, stdout) => { ... });
// filename is passed as a literal argument, never interpreted by a shell

// [SEC: injection] — if shell is unavoidable, allow-list strictly and validate
const ALLOWED_FILENAME = /^[a-zA-Z0-9_\-.]+$/;
if (!ALLOWED_FILENAME.test(filename)) {
  throw new BadRequestError('Invalid filename');
}
```

```python
# [VULNERABLE] — shell=True interprets the full string
import subprocess
subprocess.run(f"convert {filename} output.png", shell=True)

# [SEC: injection] — pass args as a list; no shell interpretation
subprocess.run(["convert", filename, "output.png"], shell=False)
```

```go
// [SEC: injection] — Go exec.Command never invokes a shell unless you ask it to
cmd := exec.Command("convert", filename, "output.png")
// NEVER: exec.Command("sh", "-c", fmt.Sprintf("convert %s output.png", filename))
```

---

## 4. Path Traversal

### The Vulnerability Pattern
```typescript
// [VULNERABLE] — user input used directly to build a file path
app.get('/files/:filename', (req, res) => {
  res.sendFile(`/var/app/uploads/${req.params.filename}`);
  // filename = "../../etc/passwd" escapes the intended directory
});
```

### The Fix
```typescript
import path from 'path';

// [SEC: injection] — resolve and verify the result stays within the allowed directory
app.get('/files/:filename', (req, res) => {
  const uploadsDir = path.resolve('/var/app/uploads');
  const requestedPath = path.resolve(uploadsDir, req.params.filename);

  if (!requestedPath.startsWith(uploadsDir + path.sep)) {
    return res.status(400).send('Invalid filename');
  }

  res.sendFile(requestedPath);
});

// [SEC: injection] — even simpler: reject any path separator in the input
const SAFE_FILENAME = /^[a-zA-Z0-9_\-.]+$/;
if (!SAFE_FILENAME.test(req.params.filename)) {
  return res.status(400).send('Invalid filename');
}
```

```python
# [SEC: injection] — Python path traversal prevention
from pathlib import Path

UPLOADS_DIR = Path('/var/app/uploads').resolve()

def get_file(filename: str):
    requested = (UPLOADS_DIR / filename).resolve()
    if not requested.is_relative_to(UPLOADS_DIR):  # Python 3.9+
        raise ValueError('Invalid filename')
    return requested
```

---

## 5. LDAP Injection

### The Vulnerability Pattern
```python
# [VULNERABLE] — unescaped input in LDAP filter
filter_str = f"(&(uid={username})(password={password}))"
# username = "*)(uid=*))(|(uid=*" can alter filter logic
```

### The Fix
```python
# [SEC: injection] — escape special LDAP filter characters
from ldap3.utils.conv import escape_filter_chars

safe_username = escape_filter_chars(username)
filter_str = f"(&(uid={safe_username})(password={escape_filter_chars(password)}))"

# [SEC: injection] — better: use the library's parameterized search API if available
conn.search('dc=example,dc=com', f'(uid={safe_username})')
```

---

## 6. Template Injection (Server-Side)

### The Vulnerability Pattern
```python
# [VULNERABLE] — user input rendered as a template, not a value
from jinja2 import Template
Template(f"Hello {user_input}").render()  # if user_input is "{{ 7*7 }}", it executes
```

### The Fix
```python
# [SEC: injection] — pass user input as DATA to the template, never as the template itself
from jinja2 import Environment, select_autoescape

env = Environment(autoescape=select_autoescape())
template = env.from_string("Hello {{ name }}")
template.render(name=user_input)  # user_input is a value substituted, not interpreted as syntax
```

---

## Injection Prevention Checklist

```
[ ] All SQL queries use parameterized queries / prepared statements / safe ORM calls
[ ] No string concatenation or f-strings building any query
[ ] Dynamic column/table names validated against an allow-list
[ ] NoSQL inputs type-validated before reaching the query (schema validation)
[ ] Shell commands use execFile/exec with arg arrays, never shell=True / exec(string)
[ ] File paths resolved and verified to stay within an allowed base directory
[ ] User input never used as a template string — always passed as template data
[ ] LDAP filter inputs escaped using the library's escape function
```
