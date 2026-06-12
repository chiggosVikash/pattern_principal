# Dart — Language-Specific Clean Code Guide

Dart/Flutter patterns with emphasis on null safety, state management, and widget architecture.

---

## 1. Null Safety — Use It Fully

```dart
// [ANTI-PATTERN: Null assertion everywhere — defeats null safety]
String name = user!.profile!.name!; // crashes at runtime if any is null

// [FIX: Proper null handling]
// Option 1: Null-coalescing
String name = user?.profile?.name ?? 'Anonymous';

// Option 2: Early return in methods
String getDisplayName(User? user) {
  if (user == null) return 'Guest';
  if (user.profile == null) return user.email;
  return user.profile!.name;  // safe — checked above
}

// Option 3: Required constructor params — no nullable where not needed
class UserProfile {
  final String name;  // non-nullable — always required
  final String? bio;  // nullable — genuinely optional

  const UserProfile({required this.name, this.bio});
}
```

---

## 2. Factory Constructors — GoF Factory in Dart

```dart
// [FIX: Factory constructor for controlled instantiation]
abstract class Notifier {
  void send(String message);

  factory Notifier.create(String type) {
    return switch (type) {
      'email' => EmailNotifier(),
      'sms'   => SMSNotifier(),
      'push'  => PushNotifier(),
      _       => throw ArgumentError('Unknown notifier type: $type'),
    };
  }
}

class EmailNotifier implements Notifier {
  @override void send(String message) => print('Email: $message');
}

// [FIX: Named constructors for semantic creation]
class Money {
  final int cents;
  const Money._(this.cents);

  factory Money.fromDollars(double dollars) => Money._(( dollars * 100).round());
  factory Money.zero() => const Money._(0);

  Money operator +(Money other) => Money._(cents + other.cents);
}
```

---

## 3. Immutability — Prefer const and final

```dart
// [ANTI-PATTERN: Mutable state where immutable suffices]
class Config {
  String apiUrl;
  int timeout;
  Config(this.apiUrl, this.timeout);
}

// [FIX: Immutable value objects]
class Config {
  final String apiUrl;
  final int timeout;
  const Config({required this.apiUrl, required this.timeout});

  Config copyWith({String? apiUrl, int? timeout}) {
    return Config(
      apiUrl:  apiUrl  ?? this.apiUrl,
      timeout: timeout ?? this.timeout,
    );
  }

  @override bool operator ==(Object other) =>
      other is Config && apiUrl == other.apiUrl && timeout == other.timeout;

  @override int get hashCode => Object.hash(apiUrl, timeout);
}

// [FIX: const widgets — Flutter-specific optimization]
class MyButton extends StatelessWidget {
  final String label;
  final VoidCallback onPressed;

  const MyButton({  // const constructor — enables compile-time constants
    super.key,
    required this.label,
    required this.onPressed,
  });

  @override
  Widget build(BuildContext context) {
    return ElevatedButton(onPressed: onPressed, child: Text(label));
  }
}
```

---

## 4. Mixins — Shared Behavior Without Inheritance

```dart
// [FIX: Mixins for cross-cutting behavior — [PATTERN: Decorator via mixin]]
mixin Loggable {
  void log(String message) => print('[${runtimeType}] $message');
}

mixin Validatable {
  List<String> get validationErrors;
  bool get isValid => validationErrors.isEmpty;
}

mixin Serializable {
  Map<String, dynamic> toJson();
}

class Order with Loggable, Validatable, Serializable {
  final String id;
  final List<OrderItem> items;

  Order({required this.id, required this.items});

  @override
  List<String> get validationErrors => [
    if (id.isEmpty) 'ID cannot be empty',
    if (items.isEmpty) 'Order must have at least one item',
  ];

  @override
  Map<String, dynamic> toJson() => {'id': id, 'items': items.map((i) => i.toJson()).toList()};
}
```

---

## 5. Streams — Reactive Patterns

```dart
// [ANTI-PATTERN: Polling instead of streaming]
Timer.periodic(Duration(seconds: 1), (_) async {
  final status = await fetchOrderStatus(orderId);
  updateUI(status);  // polls every second — wasteful
});

// [FIX: Stream-based reactive update]
Stream<OrderStatus> watchOrderStatus(String orderId) async* {
  while (true) {
    final status = await db.watchOrder(orderId).first;
    yield status;
    await Future.delayed(const Duration(milliseconds: 100));
  }
}

// In widget:
StreamBuilder<OrderStatus>(
  stream: watchOrderStatus(orderId),
  builder: (context, snapshot) {
    if (snapshot.hasError) return ErrorWidget(snapshot.error!);
    if (!snapshot.hasData) return const CircularProgressIndicator();
    return OrderStatusWidget(status: snapshot.data!);
  },
)

// [FIX: StreamController for custom event sources]
class OrderEventBus {
  final _controller = StreamController<OrderEvent>.broadcast();
  Stream<OrderEvent> get events => _controller.stream;

  void emit(OrderEvent event) => _controller.add(event);
  void dispose() => _controller.close();
}
```

---

## 6. Extension Methods — DRY Without Inheritance

```dart
// [FIX: Extension methods — add behavior to existing types without subclassing]
extension StringValidation on String {
  bool get isValidEmail => contains('@') && contains('.');
  bool get isValidPhone => RegExp(r'^\+?[0-9]{10,13}$').hasMatch(this);
  String get titleCase => split(' ').map((w) => w.isEmpty
      ? w : '${w[0].toUpperCase()}${w.substring(1).toLowerCase()}').join(' ');
}

extension MoneyFormatting on double {
  String toINR() => '₹${toStringAsFixed(2)}';
  String toUSD() => '\$${toStringAsFixed(2)}';
}

extension DateTimeUtils on DateTime {
  bool get isToday {
    final now = DateTime.now();
    return day == now.day && month == now.month && year == now.year;
  }
  bool get isPast => isBefore(DateTime.now());
}

// Usage — reads naturally:
if (email.isValidEmail) { ... }
print(price.toINR());
if (order.createdAt.isPast) { ... }
```

---

## 7. Error Handling — Either Pattern

```dart
// [ANTI-PATTERN: Throwing exceptions for expected failures]
Future<User> getUser(String id) async {
  final user = await db.find(id);
  if (user == null) throw Exception('User not found'); // exceptions for control flow
}

// [FIX: Sealed classes for Result type — Dart 3+]
sealed class Result<T> {}

class Success<T> extends Result<T> {
  final T value;
  const Success(this.value);
}

class Failure<T> extends Result<T> {
  final String error;
  final StackTrace? stackTrace;
  const Failure(this.error, [this.stackTrace]);
}

Future<Result<User>> getUser(String id) async {
  try {
    final user = await db.find(id);
    if (user == null) return Failure('User $id not found');
    return Success(user);
  } catch (e, st) {
    return Failure('Database error: $e', st);
  }
}

// Caller uses pattern matching:
final result = await getUser(id);
switch (result) {
  case Success(:final value): showUser(value);
  case Failure(:final error): showError(error);
}
```

---

## Dart Quick Checklist

```
[ ] No null assertion (!) without a null check above it
[ ] Factory constructors for polymorphic creation
[ ] const constructors on all immutable classes
[ ] final fields everywhere — mutable only when truly needed
[ ] copyWith() on all value objects
[ ] Mixins for shared behavior — not abstract class inheritance
[ ] Sealed classes + Result<T> for expected failures
[ ] Extension methods for utility functions — no Utils class
[ ] StreamBuilder for reactive UI — no polling timers
```
