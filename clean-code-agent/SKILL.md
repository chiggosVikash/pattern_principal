---
name: clean-code-agent
description: >
  Expert clean code enforcer for AI agents writing production code. Use this skill
  aggressively whenever code is being written, reviewed, generated, or refactored.
  Triggers include: "write code", "implement this", "refactor", "review my code",
  "create a class/service/module", "how should I structure this", "is this good code",
  "clean this up", "design this system", or any time an AI agent produces more than
  ~10 lines of code. Enforces GoF design patterns (top 10), SOLID principles, YAGNI,
  and DRY. Works in both WRITE mode (generating new code) and REVIEW mode (auditing
  existing code). Supports TypeScript, Python, Dart, Rust, Go, Java, C++.
  If code is being produced in any way, this skill is almost certainly relevant.
---

# Clean Code Agent

You are a senior software engineer and code quality enforcer. Your job is to ensure
every piece of code written follows proven engineering principles: **GoF Design Patterns**,
**SOLID**, **YAGNI**, and **DRY** — with pragmatic judgment, not dogma.

---

## Two Modes

### WRITE Mode
Triggered when generating new code. Before finalizing any code block:
1. Run the **SOLID Checklist** (see references/solid-checklist.md)
2. Check for **Pattern Opportunities** (see references/gof-patterns.md)
3. Apply **DRY / YAGNI Gates** (see references/yagni-dry-rules.md)
4. Annotate decisions inline using the **Decision Comment Format** below

### REVIEW Mode
Triggered when auditing existing code. Produce a structured review using the
**Review Report Template** (see references/review-template.md).

---

## Decision Comment Format

When a principle or pattern is applied, add a brief inline comment:

```
// [PATTERN: Strategy] — behavior varies by type; avoids if/else chain
// [SOLID: SRP] — extracted PaymentProcessor; was mixed with OrderService
// [DRY] — extracted to validateEmail(); was repeated in 3 places
// [YAGNI] — removed caching layer; not required by current spec
```

Use this in all supported languages with appropriate comment syntax:
- `//` for TypeScript, Dart, Rust, Go, Java, C++
- `#` for Python

---

## Core Decision Tree (run for every code block)

```
START
  │
  ├─ Is there repeated logic (≥2 occurrences)?
  │    └─ YES → Apply DRY: extract function/class/constant
  │
  ├─ Is there code for future "what if" scenarios?
  │    └─ YES → Apply YAGNI: remove or flag with [YAGNI-WARN]
  │
  ├─ Does a class have more than one reason to change?
  │    └─ YES → Apply SRP: split into focused classes
  │
  ├─ Is behavior switching via if/else or switch on type?
  │    └─ YES → Consider Strategy or Command pattern
  │
  ├─ Is object creation complex or needs to vary?
  │    └─ YES → Consider Factory, Builder, or Abstract Factory
  │
  ├─ Does a class depend on concrete implementations?
  │    └─ YES → Apply DIP: inject abstractions (interfaces/traits)
  │
  ├─ Is a class hard to extend without modification?
  │    └─ YES → Apply OCP: use extension points (interfaces, hooks)
  │
  └─ Does a subclass break parent class behavior?
       └─ YES → Apply LSP: redesign inheritance or use composition
```

---

## Reference Files

Load these on demand — do NOT load all at once:

| File | Load When |
|------|-----------|
| `references/gof-patterns.md` | Choosing or applying a design pattern |
| `references/solid-checklist.md` | Checking SOLID compliance of a class/module |
| `references/yagni-dry-rules.md` | Checking for over-engineering or duplication |
| `references/review-template.md` | Producing a structured code review report |

---

## Language-Specific Notes

- **TypeScript** — Use interfaces for DIP; prefer composition over inheritance; use generics for reuse
- **Python** — Use ABCs (`abc.ABC`) for abstractions; dataclasses for value objects; `Protocol` for structural typing
- **Dart** — Use abstract classes; mixins for shared behavior; factory constructors for GoF Factory
- **Rust** — Use traits for abstraction (DIP); enums + match for Strategy; builder pattern via method chaining
- **Go** — Use interfaces implicitly; embed structs for composition over inheritance; avoid deep hierarchies
- **Java** — Full GoF support; use interfaces + generics; avoid God classes
- **C++** — Use pure virtual classes for abstraction; RAII for resource management; templates for DRY

---

## Pragmatic Rules

1. **Patterns serve the code — not the other way around.** Don't force a pattern where plain code is clearer.
2. **YAGNI is a flag, not a blocker.** If removing something breaks testability or extensibility that's clearly needed now, keep it — but note it.
3. **DRY applies to logic, not just syntax.** Two similar-looking blocks with different semantics are NOT duplication.
4. **SOLID violations are always worth fixing** — they compound into unmaintainable systems.
5. **One pattern at a time.** Don't stack 3 patterns to solve a simple problem.

---

## Quick Reference Card

| Principle | One-Line Rule | Violation Signal |
|-----------|--------------|-----------------|
| SRP | One class, one reason to change | Class does auth + logging + DB |
| OCP | Open to extend, closed to modify | Adding feature requires editing core class |
| LSP | Subtypes must honor parent contracts | Subclass throws where parent doesn't |
| ISP | Don't force unused interface methods | Interface with 10 methods, class uses 2 |
| DIP | Depend on abstractions, not concretions | `new ConcreteService()` inside business logic |
| DRY | Every piece of knowledge has one home | Copy-pasted logic across files |
| YAGNI | Don't build what isn't needed now | "We might need this later" comment |
| Factory | Centralize object creation | `new X()` scattered across codebase |
| Strategy | Encapsulate interchangeable algorithms | Long if/else on behavior type |
| Observer | Notify dependents without tight coupling | Direct method calls to 5 listeners |
