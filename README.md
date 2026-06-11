# pattern_principal

> AI Agent skills for writing clean, principled production code.

A collection of Claude AI agent skills that enforce software engineering best practices — automatically, consistently, across every language.

---

## Skills

### [`clean-code-agent`](./clean-code-agent/SKILL.md)

An AI coding skill that enforces:

| Principle | Coverage |
|-----------|----------|
| **GoF Design Patterns** | Top 10 patterns with "when to use" signals |
| **SOLID** | All 5 principles with violation detection & fixes |
| **YAGNI** | Over-engineering detection with pragmatic exceptions |
| **DRY** | 4 types of duplication with extraction strategies |

**Languages:** TypeScript · Python · Dart · Rust · Go · Java · C++

**Modes:**
- **WRITE mode** — guides code generation inline with Decision Comments
- **REVIEW mode** — produces structured review reports with severity ratings

---

## How to Use

### In Claude (claude.ai)

1. Copy the [`clean-code-agent/SKILL.md`](./clean-code-agent/SKILL.md) content
2. Paste it into a Claude Project's custom instructions
3. Claude will now enforce all principles while writing or reviewing your code

### As a Reference

Browse the `references/` folder directly:

| File | Use For |
|------|---------|
| [`references/gof-patterns.md`](./clean-code-agent/references/gof-patterns.md) | Pattern examples in 7 languages |
| [`references/solid-checklist.md`](./clean-code-agent/references/solid-checklist.md) | SOLID violation detection & fixes |
| [`references/yagni-dry-rules.md`](./clean-code-agent/references/yagni-dry-rules.md) | Over-engineering & duplication rules |
| [`references/review-template.md`](./clean-code-agent/references/review-template.md) | Structured code review format |

---

## Decision Comment Format

When the skill applies a principle, it annotates code with:

```typescript
// [PATTERN: Strategy] — behavior varies by type; avoids if/else chain
// [SOLID: SRP] — extracted PaymentProcessor; was mixed with OrderService
// [DRY] — extracted to validateEmail(); was repeated in 3 places
// [YAGNI] — removed caching layer; not required by current spec
```

---

## Folder Structure

```
pattern_principal/
└── clean-code-agent/
    ├── SKILL.md                    ← main skill file (start here)
    └── references/
        ├── gof-patterns.md         ← top 10 GoF patterns, 7 languages
        ├── solid-checklist.md      ← SOLID audit checklist + fixes
        ├── yagni-dry-rules.md      ← YAGNI/DRY heuristics + examples
        └── review-template.md      ← structured review report format
```

---

## Contributing

PRs welcome for:
- Additional GoF patterns (remaining 13)
- New language examples
- Real-world violation + fix case studies

---

## Author

Built by [chiggosVikash](https://github.com/chiggosVikash) · [ParivartanX](https://parivartanx.com)
