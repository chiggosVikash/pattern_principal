# C++ — Language-Specific Clean Code Guide

Modern C++ (17/20). RAII, smart pointers, and zero-cost abstractions.

---

## 1. RAII — Resource Acquisition Is Initialization

```cpp
// [ANTI-PATTERN: Manual resource management — memory leak on exception]
void process() {
    int* data = new int[1000];
    doWork(data);   // if this throws, data leaks
    delete[] data;  // never reached on exception
}

// [FIX: RAII — destructor guarantees cleanup]
void process() {
    std::vector<int> data(1000);  // destructor frees memory automatically
    doWork(data);                 // exception-safe
}

// [FIX: Custom RAII wrapper for non-memory resources]
class FileHandle {
public:
    explicit FileHandle(const std::string& path)
        : handle_(std::fopen(path.c_str(), "r")) {
        if (!handle_) throw std::runtime_error("Cannot open: " + path);
    }
    ~FileHandle() { if (handle_) std::fclose(handle_); }

    // Non-copyable — move only
    FileHandle(const FileHandle&) = delete;
    FileHandle& operator=(const FileHandle&) = delete;
    FileHandle(FileHandle&& other) noexcept : handle_(other.handle_) { other.handle_ = nullptr; }

    FILE* get() const { return handle_; }
private:
    FILE* handle_;
};
```

---

## 2. Smart Pointers — No Raw new/delete

```cpp
// [ANTI-PATTERN: Raw pointers — who owns this? Who deletes it?]
Widget* createWidget() { return new Widget(); }  // caller must delete — easy to forget

// [FIX: unique_ptr — clear single ownership]
std::unique_ptr<Widget> createWidget() {
    return std::make_unique<Widget>();
}

// [FIX: shared_ptr — shared ownership]
std::shared_ptr<Config> loadConfig() {
    return std::make_shared<Config>();
}

// [FIX: DIP with smart pointers]
class OrderService {
public:
    explicit OrderService(std::unique_ptr<OrderRepository> repo)
        : repo_(std::move(repo)) {}

    void placeOrder(const Order& order) { repo_->save(order); }

private:
    std::unique_ptr<OrderRepository> repo_;
};

// [RULE: Never use raw new/delete in application code]
// Use: make_unique, make_shared, vector, string, containers
```

---

## 3. Templates — DRY at Compile Time

```cpp
// [ANTI-PATTERN: DRY violation — same algorithm for multiple types]
int maxInt(int a, int b) { return a > b ? a : b; }
double maxDouble(double a, double b) { return a > b ? a : b; }

// [FIX: Template — one definition, infinite types]
template<typename T>
T max_val(T a, T b) { return a > b ? a : b; }

// [FIX: Concepts (C++20) — constrained templates]
template<typename T>
concept Numeric = std::integral<T> || std::floating_point<T>;

template<Numeric T>
T clamp(T value, T low, T high) {
    return std::max(low, std::min(value, high));
}

// [FIX: Generic Repository with templates]
template<typename Entity, typename ID>
class Repository {
public:
    virtual ~Repository() = default;
    virtual std::optional<Entity> findById(const ID& id) const = 0;
    virtual void save(const Entity& entity) = 0;
    virtual void remove(const ID& id) = 0;
};

class UserRepository : public Repository<User, UserId> {
public:
    std::optional<User> findById(const UserId& id) const override { ... }
    void save(const User& user) override { ... }
    void remove(const UserId& id) override { ... }
};
```

---

## 4. std::optional & std::variant — No Null, No Unions

```cpp
// [ANTI-PATTERN: Returning nullptr to signal failure]
User* findUser(const std::string& id) {
    // returns nullptr if not found — caller must check, easy to forget
}

// [FIX: std::optional — explicit absence]
std::optional<User> findUser(const std::string& id) {
    auto it = users_.find(id);
    if (it == users_.end()) return std::nullopt;
    return it->second;
}

auto user = findUser(id);
if (user.has_value()) {
    process(*user);
}
// Or with value_or:
auto name = findUser(id).transform([](const User& u) { return u.name; })
                         .value_or("Unknown");

// [FIX: std::variant — type-safe union, replaces void* and C unions]
using Result = std::variant<User, NotFoundError, DatabaseError>;

Result getUser(const std::string& id) {
    try {
        auto user = db_.find(id);
        if (!user) return NotFoundError{"User not found: " + id};
        return *user;
    } catch (const DbException& e) {
        return DatabaseError{e.what()};
    }
}

// Exhaustive visit:
std::visit([](auto&& result) {
    using T = std::decay_t<decltype(result)>;
    if constexpr (std::is_same_v<T, User>)
        processUser(result);
    else if constexpr (std::is_same_v<T, NotFoundError>)
        log("Not found: " + result.message);
    else
        log("DB error: " + result.message);
}, getUser(id));
```

---

## 5. Move Semantics — Zero-Cost Ownership Transfer

```cpp
// [ANTI-PATTERN: Unnecessary copy of large objects]
std::vector<Record> processRecords(std::vector<Record> records) {
    // modifies records, returns
    return records; // copies entire vector on return!
}

// [FIX: Move semantics — O(1) transfer, no copy]
std::vector<Record> processRecords(std::vector<Record> records) {
    for (auto& r : records) transform(r);
    return records; // NRVO or implicit move — no copy
}

// [FIX: Perfect forwarding in templates]
template<typename T>
class Cache {
    std::unordered_map<std::string, T> store_;
public:
    template<typename V>
    void put(const std::string& key, V&& value) {
        store_.emplace(key, std::forward<V>(value)); // no unnecessary copy
    }
};
```

---

## 6. Lambda & std::function — Modern Callbacks

```cpp
// [ANTI-PATTERN: Function pointer — no capture, no type safety]
void process(int* data, int n, bool (*filter)(int)) { ... }

// [FIX: std::function + lambda — captures context, type-safe]
void process(std::span<int> data, std::function<bool(int)> filter) {
    for (auto& item : data) {
        if (filter(item)) transform(item);
    }
}

// [FIX: PATTERN: Strategy via lambdas]
class Sorter {
    using Comparator = std::function<bool(const Record&, const Record&)>;
    Comparator compare_;
public:
    explicit Sorter(Comparator c) : compare_(std::move(c)) {}
    void sort(std::vector<Record>& data) {
        std::sort(data.begin(), data.end(), compare_);
    }
};

auto byName = Sorter([](const Record& a, const Record& b) {
    return a.name < b.name;
});
auto byAge  = Sorter([](const Record& a, const Record& b) {
    return a.age < b.age;
});
```

---

## C++ Quick Checklist

```
[ ] RAII for all resources — no manual delete/fclose/free
[ ] Smart pointers only — no raw new/delete in application code
[ ] std::optional instead of nullptr returns
[ ] std::variant instead of C unions or void*
[ ] Templates for type-generic algorithms — no copy-paste per type
[ ] Concepts (C++20) to constrain template parameters
[ ] std::span for read-only array parameters — not raw pointer + size
[ ] Move semantics — return by value, let compiler optimize
[ ] = delete on copy when ownership is unique
[ ] [[nodiscard]] on functions whose return value must not be ignored
```
