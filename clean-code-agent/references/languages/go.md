# Go — Language-Specific Clean Code Guide

Idiomatic Go patterns. Go has strong opinions — follow them. Apply on top of base rules.

---

## 1. Interfaces — Small, Implicit, Powerful

```go
// [ANTI-PATTERN: Java-style fat interface]
type UserService interface {
    CreateUser(u User) error
    UpdateUser(u User) error
    DeleteUser(id string) error
    GetUser(id string) (User, error)
    GetAllUsers() ([]User, error)
    AuthenticateUser(email, password string) (Token, error)
    SendWelcomeEmail(u User) error
}

// [FIX: ISP — small, focused interfaces]
// Callers declare only what they need
type UserReader interface {
    GetUser(id string) (User, error)
}
type UserWriter interface {
    CreateUser(u User) error
    UpdateUser(u User) error
}
type Authenticator interface {
    Authenticate(email, password string) (Token, error)
}

// [FIX: Interfaces defined at point of USE, not at point of implementation]
// handlers/user.go — only declares what it needs:
type userFetcher interface {
    GetUser(id string) (User, error)
}

func NewUserHandler(svc userFetcher) *UserHandler {
    return &UserHandler{svc: svc}
}
// The concrete UserService satisfies this implicitly — no 'implements' needed
```

---

## 2. Error Handling — Errors Are Values

```go
// [ANTI-PATTERN: Ignoring errors]
user, _ := repo.GetUser(id)  // ignoring error ← never do this

// [ANTI-PATTERN: Panic for expected errors]
user, err := repo.GetUser(id)
if err != nil { panic(err) }  // panic is for truly unexpected states only

// [FIX: Always handle errors explicitly]
user, err := repo.GetUser(id)
if err != nil {
    return fmt.Errorf("getUser %s: %w", id, err)  // wrap with context
}

// [FIX: Sentinel errors for known conditions]
var (
    ErrNotFound     = errors.New("not found")
    ErrUnauthorized = errors.New("unauthorized")
    ErrConflict     = errors.New("conflict")
)

func (r *UserRepo) GetUser(id string) (User, error) {
    var user User
    err := r.db.Get(&user, "SELECT * FROM users WHERE id=$1", id)
    if errors.Is(err, sql.ErrNoRows) {
        return User{}, fmt.Errorf("user %s: %w", id, ErrNotFound)
    }
    return user, err
}

// Caller uses errors.Is for clean matching:
if errors.Is(err, ErrNotFound) {
    return http.StatusNotFound, nil
}

// [FIX: Custom error types for rich context]
type ValidationError struct {
    Field   string
    Message string
}
func (e *ValidationError) Error() string {
    return fmt.Sprintf("validation failed on %s: %s", e.Field, e.Message)
}
```

---

## 3. Composition Over Inheritance

```go
// Go has no inheritance — use struct embedding and interfaces

// [FIX: Embed for shared behavior — PATTERN: Decorator]
type BaseRepository struct {
    db *sql.DB
}
func (r *BaseRepository) exec(query string, args ...any) error {
    _, err := r.db.Exec(query, args...)
    return err
}

type UserRepository struct {
    BaseRepository  // embedded — gets exec() for free
}
func (r *UserRepository) Save(u User) error {
    return r.exec("INSERT INTO users ...", u.ID, u.Name)
}

// [FIX: Interface composition]
type ReadWriter interface {
    Reader
    Writer
}
type Reader interface { Read() ([]byte, error) }
type Writer interface { Write([]byte) error }
```

---

## 4. Goroutines & Channels — Concurrency Patterns

```go
// [ANTI-PATTERN: Goroutine leak — no way to stop it]
func startWorker() {
    go func() {
        for { process() }  // runs forever, no cancel
    }()
}

// [FIX: Context for cancellation]
func startWorker(ctx context.Context) {
    go func() {
        for {
            select {
            case <-ctx.Done():
                return  // clean shutdown
            default:
                process()
            }
        }
    }()
}

// [FIX: Fan-out pattern — parallel work with WaitGroup]
func processAll(ctx context.Context, items []Item) error {
    var wg sync.WaitGroup
    errCh := make(chan error, len(items))

    for _, item := range items {
        wg.Add(1)
        go func(item Item) {
            defer wg.Done()
            if err := process(ctx, item); err != nil {
                errCh <- err
            }
        }(item)
    }

    wg.Wait()
    close(errCh)

    for err := range errCh {
        if err != nil { return err }
    }
    return nil
}

// [ANTI-PATTERN: Sharing memory — use communication instead]
// [FIX: Channel pipeline]
func pipeline(ctx context.Context, input <-chan Item) <-chan Result {
    out := make(chan Result)
    go func() {
        defer close(out)
        for item := range input {
            select {
            case out <- process(item):
            case <-ctx.Done():
                return
            }
        }
    }()
    return out
}
```

---

## 5. Dependency Injection — No init() Magic

```go
// [ANTI-PATTERN: init() for global state — untestable]
var db *sql.DB
func init() {
    db, _ = sql.Open("postgres", os.Getenv("DB_URL"))
}

// [FIX: Constructor injection]
type UserHandler struct {
    repo UserReader
    log  *slog.Logger
}

func NewUserHandler(repo UserReader, log *slog.Logger) *UserHandler {
    return &UserHandler{repo: repo, log: log}
}

// Wired at main():
func main() {
    db, _ := sql.Open("postgres", os.Getenv("DB_URL"))
    repo    := postgres.NewUserRepo(db)
    logger  := slog.New(slog.NewJSONHandler(os.Stdout, nil))
    handler := NewUserHandler(repo, logger)
    // ...
}
```

---

## 6. Options Pattern — Flexible Constructors

```go
// [ANTI-PATTERN: Long parameter list for optional config]
func NewServer(host string, port int, timeout time.Duration,
    maxConn int, tls bool, certFile string) *Server { ... }

// [FIX: Functional Options Pattern — PATTERN: Builder in Go style]
type ServerOption func(*Server)

func WithTimeout(d time.Duration) ServerOption {
    return func(s *Server) { s.timeout = d }
}
func WithMaxConnections(n int) ServerOption {
    return func(s *Server) { s.maxConn = n }
}
func WithTLS(cert, key string) ServerOption {
    return func(s *Server) { s.tls = true; s.certFile = cert; s.keyFile = key }
}

func NewServer(host string, port int, opts ...ServerOption) *Server {
    s := &Server{host: host, port: port, timeout: 30 * time.Second, maxConn: 100}
    for _, opt := range opts { opt(s) }
    return s
}

// Usage — clean, readable, extensible:
srv := NewServer("localhost", 8080,
    WithTimeout(60 * time.Second),
    WithTLS("cert.pem", "key.pem"),
)
```

---

## 7. Table-Driven Tests

```go
// [FIX: Table-driven tests — DRY for test cases]
func TestCalculateDiscount(t *testing.T) {
    tests := []struct {
        name     string
        price    float64
        userTier string
        want     float64
    }{
        {"no discount for basic", 100, "basic", 100},
        {"10% for gold",         100, "gold",  90},
        {"20% for premium",      100, "premium", 80},
        {"zero price unchanged", 0,   "premium", 0},
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            got := calculateDiscount(tt.price, tt.userTier)
            if got != tt.want {
                t.Errorf("got %v, want %v", got, tt.want)
            }
        })
    }
}
```

---

## Go Quick Checklist

```
[ ] Interfaces small (1-3 methods) and defined at point of use
[ ] All errors handled — no _ on error returns
[ ] Errors wrapped with context: fmt.Errorf("op: %w", err)
[ ] Sentinel errors for known conditions (ErrNotFound etc.)
[ ] Goroutines receive context.Context for cancellation
[ ] No package-level mutable vars — inject via constructors
[ ] Functional options for optional config (not long param lists)
[ ] Table-driven tests for all pure functions
[ ] Composition via embedding, not inheritance (no inheritance in Go)
```
