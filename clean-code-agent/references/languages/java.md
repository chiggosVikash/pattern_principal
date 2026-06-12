# Java — Language-Specific Clean Code Guide

Modern Java (17+) patterns. Embrace records, sealed classes, and streams.

---

## 1. Records — Value Objects Without Boilerplate

```java
// [ANTI-PATTERN: Manual value object — 40 lines of boilerplate]
public class Money {
    private final long cents;
    private final String currency;
    public Money(long cents, String currency) { this.cents = cents; this.currency = currency; }
    public long getCents() { return cents; }
    public String getCurrency() { return currency; }
    @Override public boolean equals(Object o) { ... }
    @Override public int hashCode() { ... }
    @Override public String toString() { ... }
}

// [FIX: Record — 1 line, same result]
public record Money(long cents, String currency) {
    // Compact constructor for validation
    public Money {
        if (cents < 0) throw new IllegalArgumentException("Amount cannot be negative");
        if (currency.length() != 3) throw new IllegalArgumentException("Invalid currency code");
    }

    public Money add(Money other) {
        if (!currency.equals(other.currency)) throw new IllegalArgumentException("Currency mismatch");
        return new Money(cents + other.cents, currency);
    }

    public static Money of(double amount, String currency) {
        return new Money(Math.round(amount * 100), currency);
    }
}

// [FIX: Records as DTOs]
public record CreateUserRequest(String name, String email, String password) {}
public record UserResponse(String id, String name, String email, Instant createdAt) {}
```

---

## 2. Sealed Classes — Exhaustive Modeling

```java
// [FIX: Sealed classes + records for algebraic data types — Java 17+]
public sealed interface OrderStatus
    permits OrderStatus.Pending, OrderStatus.Fulfilled, OrderStatus.Cancelled {

    record Pending(Instant createdAt) implements OrderStatus {}
    record Fulfilled(Instant fulfilledAt, String trackingId) implements OrderStatus {}
    record Cancelled(Instant cancelledAt, String reason) implements OrderStatus {}
}

// [FIX: Pattern matching switch — exhaustive, no default needed]
String describe(OrderStatus status) {
    return switch (status) {
        case OrderStatus.Pending p    -> "Pending since " + p.createdAt();
        case OrderStatus.Fulfilled f  -> "Shipped: " + f.trackingId();
        case OrderStatus.Cancelled c  -> "Cancelled: " + c.reason();
        // Compiler error if a case is missing — exhaustive!
    };
}
```

---

## 3. Optional — No More NullPointerException

```java
// [ANTI-PATTERN: Returning null]
public User findUser(String id) {
    User user = db.find(id);
    return user; // might be null — caller has no idea!
}

// [ANTI-PATTERN: Optional misuse — using it as a null check shortcut]
Optional<User> user = findUser(id);
if (user.isPresent()) { // same as != null, defeats the purpose
    process(user.get());
}

// [FIX: Use Optional's functional API]
Optional<User> findUser(String id) {
    return Optional.ofNullable(db.find(id));
}

// Chain transformations:
String displayName = findUser(id)
    .filter(User::isActive)
    .map(User::getDisplayName)
    .orElse("Guest");

// Throw domain exception if not found:
User user = findUser(id)
    .orElseThrow(() -> new NotFoundException("User not found: " + id));

// [RULE: Optional only for return types — never for fields or parameters]
// ❌ private Optional<String> name;  // never a field
// ❌ void process(Optional<User> user) // never a param
```

---

## 4. Streams — Functional Data Processing

```java
// [ANTI-PATTERN: Imperative loop accumulation]
List<String> result = new ArrayList<>();
for (User user : users) {
    if (user.isActive() && user.getAge() >= 18) {
        result.add(user.getName().toUpperCase());
    }
}
Collections.sort(result);

// [FIX: Stream pipeline — declarative, parallel-ready]
List<String> result = users.stream()
    .filter(User::isActive)
    .filter(u -> u.getAge() >= 18)
    .map(User::getName)
    .map(String::toUpperCase)
    .sorted()
    .collect(Collectors.toList());

// [FIX: Collectors for grouping]
Map<String, List<Order>> ordersByStatus = orders.stream()
    .collect(Collectors.groupingBy(Order::getStatus));

Map<String, Long> countByStatus = orders.stream()
    .collect(Collectors.groupingBy(Order::getStatus, Collectors.counting()));

// [FIX: Parallel stream for CPU-bound operations on large datasets]
// ONLY use when: data > 10k items AND processing is CPU-bound AND order doesn't matter
OptionalInt maxScore = largeDataset.parallelStream()
    .mapToInt(Item::getScore)
    .max();
```

---

## 5. Builder Pattern — Complex Object Construction

```java
// [FIX: Builder for objects with many optional fields]
public class EmailMessage {
    private final String to;
    private final String subject;
    private final String body;
    private final List<String> cc;
    private final boolean isHtml;

    private EmailMessage(Builder builder) {
        this.to      = builder.to;
        this.subject = builder.subject;
        this.body    = builder.body;
        this.cc      = Collections.unmodifiableList(builder.cc);
        this.isHtml  = builder.isHtml;
    }

    public static Builder builder(String to, String subject) {
        return new Builder(to, subject);
    }

    public static class Builder {
        private final String to;
        private final String subject;
        private String body = "";
        private List<String> cc = new ArrayList<>();
        private boolean isHtml = false;

        private Builder(String to, String subject) {
            this.to = Objects.requireNonNull(to, "to is required");
            this.subject = Objects.requireNonNull(subject, "subject is required");
        }

        public Builder body(String body) { this.body = body; return this; }
        public Builder cc(String... addresses) { this.cc.addAll(List.of(addresses)); return this; }
        public Builder html() { this.isHtml = true; return this; }
        public EmailMessage build() { return new EmailMessage(this); }
    }
}

// Clean usage:
var email = EmailMessage.builder("user@example.com", "Welcome!")
    .body("<h1>Hello!</h1>")
    .html()
    .cc("admin@example.com")
    .build();
```

---

## 6. Dependency Injection — Constructor Injection

```java
// [ANTI-PATTERN: Field injection — hidden dependency, untestable]
@Service
public class OrderService {
    @Autowired private OrderRepository repo;        // hidden
    @Autowired private NotificationService notify;  // hidden
    @Autowired private InventoryService inventory;  // hidden
}

// [FIX: Constructor injection — explicit, testable, immutable]
@Service
public class OrderService {
    private final OrderRepository repo;
    private final NotificationService notify;
    private final InventoryService inventory;

    public OrderService(  // Spring auto-injects when single constructor
        OrderRepository repo,
        NotificationService notify,
        InventoryService inventory
    ) {
        this.repo      = Objects.requireNonNull(repo);
        this.notify    = Objects.requireNonNull(notify);
        this.inventory = Objects.requireNonNull(inventory);
    }
}
```

---

## Java Quick Checklist

```
[ ] Records for value objects and DTOs — no manual equals/hashCode
[ ] Sealed classes for state machines — exhaustive pattern matching
[ ] Optional<T> only on return types — never fields/params
[ ] Stream pipelines over imperative loops
[ ] Constructor injection — never @Autowired on fields
[ ] Builder pattern for objects with 4+ optional fields
[ ] No raw types — generics everywhere (List<User> not List)
[ ] Immutable collections: List.of(), Map.of(), Set.of()
```
