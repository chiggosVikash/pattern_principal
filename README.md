# pattern-principal

> AI Agent skills for writing clean, principled production code.

Installable skill collection enforcing **GoF Design Patterns**, **SOLID**, **YAGNI**, and **DRY** — across every major AI IDE and coding agent.

**Languages:** TypeScript · Python · Dart · Rust · Go · Java · C++

---

## Quick Start

```bash
# Auto-detect your installed IDEs and install
npx pattern-principal install clean-code-agent

# Install for a specific IDE
npx pattern-principal install clean-code-agent --ide cursor
npx pattern-principal install clean-code-agent --ide cursor,windsurf

# Install for ALL supported IDEs at once
npx pattern-principal install clean-code-agent --ide all

# See all supported IDEs and their rule file locations
npx pattern-principal ides

# List available skills
npx pattern-principal list

# Uninstall
npx pattern-principal uninstall clean-code-agent
```

---

## Supported IDEs

| IDE | Rule File Location | Scope | `--ide` flag |
|-----|-------------------|-------|-------------|
| 🤖 Claude Code | `~/.claude/skills/<skill>/` | global | `claudecode` |
| ⬛ Cursor | `.cursor/rules/<skill>.mdc` | project | `cursor` |
| 🌊 Windsurf | `.windsurf/rules/<skill>.md` | project | `windsurf` |
| 🌊 Windsurf (global) | `~/.codeium/windsurf/memories/global_rules.md` | global | `windsurf` |
| 🐙 GitHub Copilot | `.github/copilot-instructions.md` | project | `copilot` |
| 🔷 Cline | `.clinerules/<skill>.md` | project | `cline` |
| 🔷 Cline (global) | `~/.cline/rules/<skill>.md` | global | `cline` |
| ⚡ Zed | `AGENTS.md` / `~/.config/zed/AGENTS.md` | both | `zed` |
| ▶️ Continue.dev | `.continue/rules/<skill>.md` | project | `continue` |
| 🌐 AGENTS.md | `AGENTS.md` (universal standard) | project | `agentsmd` |

---

## Available Skills

### `clean-code-agent`

| Principle | Coverage |
|-----------|----------|
| **GoF Design Patterns** | Top 10 patterns with "when to use" signals |
| **SOLID** | All 5 principles — violation detection & fixes |
| **YAGNI** | Over-engineering detection with pragmatic exceptions |
| **DRY** | 4 duplication types with extraction strategies |

**Two modes:** WRITE (inline annotations while coding) · REVIEW (structured reports with severity ratings)

---

## How Auto-Detection Works

Running `npx pattern-principal install <skill>` without `--ide` will:
1. Scan your machine for installed IDEs (checks config dirs, app paths)
2. Install to every detected IDE automatically
3. Print exactly what was installed and where

---

## Decision Comment Format

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
├── package.json
├── bin/
│   └── cli.js                      ← multi-IDE installer CLI
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
- More skills (`testing-agent`, `api-design-agent`, `security-agent`)
- Support for new IDEs

---

## Author

Built by [chiggosVikash](https://github.com/chiggosVikash) · [ParivartanX](https://parivartanx.com)
