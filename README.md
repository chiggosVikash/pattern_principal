# pattern-principal

> AI Agent skills for writing clean, principled production code.

Installable skill collection that enforces **GoF Design Patterns**, **SOLID**, **YAGNI**, and **DRY** while your AI agent writes or reviews code.

**Languages:** TypeScript · Python · Dart · Rust · Go · Java · C++

---

## Quick Start

```bash
# Install a skill
npx pattern-principal install clean-code-agent

# Install all skills
npx pattern-principal install --all

# List available skills
npx pattern-principal list

# Get info on a skill
npx pattern-principal info clean-code-agent

# Uninstall
npx pattern-principal uninstall clean-code-agent
```

Skills are installed to `~/.claude/skills/` on your machine.

---

## Available Skills

### `clean-code-agent`

An AI coding skill that enforces:

| Principle | Coverage |
|-----------|----------|
| **GoF Design Patterns** | Top 10 patterns with "when to use" signals |
| **SOLID** | All 5 principles — violation detection & fixes |
| **YAGNI** | Over-engineering detection with pragmatic exceptions |
| **DRY** | 4 duplication types with extraction strategies |

---

## Using After Install

### 1. Claude.ai Projects
Open a Project → **Custom Instructions** → paste the contents of:
```
~/.claude/skills/clean-code-agent/SKILL.md
```

### 2. Claude Code
Add to your `CLAUDE.md` in project root:
```
Read and follow ~/.claude/skills/clean-code-agent/SKILL.md
```

### 3. Any AI Agent / System Prompt
Reference the installed skill path:
```
~/.claude/skills/clean-code-agent/SKILL.md
```

---

## Decision Comment Format

When the skill is active, your AI agent annotates code inline:

```typescript
// [PATTERN: Strategy] — behavior varies by type; avoids if/else chain
// [SOLID: SRP] — extracted PaymentProcessor; was mixed with OrderService
// [DRY] — extracted to validateEmail(); was repeated in 3 places
// [YAGNI] — removed caching layer; not required by current spec
```

---

## Two Modes

- **WRITE mode** — guides code generation with inline annotations
- **REVIEW mode** — produces structured reports with severity ratings (`CRITICAL` / `MAJOR` / `MINOR` / `SUGGESTION`)

---

## Folder Structure

```
pattern_principal/
├── package.json
├── bin/
│   └── cli.js                      ← installer CLI
└── clean-code-agent/
    ├── SKILL.md                    ← main skill file
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
- More skills (e.g. `testing-agent`, `api-design-agent`)

---

## Author

Built by [chiggosVikash](https://github.com/chiggosVikash) · [ParivartanX](https://parivartanx.com)
