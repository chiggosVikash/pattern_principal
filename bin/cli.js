#!/usr/bin/env node

const fs   = require("fs");
const path = require("path");
const os   = require("os");

// ─── ANSI Colors ─────────────────────────────────────────────────────────────
const bold    = (s) => `\x1b[1m${s}\x1b[0m`;
const dim     = (s) => `\x1b[2m${s}\x1b[0m`;
const green   = (s) => `\x1b[32m${s}\x1b[0m`;
const cyan    = (s) => `\x1b[36m${s}\x1b[0m`;
const yellow  = (s) => `\x1b[33m${s}\x1b[0m`;
const red     = (s) => `\x1b[31m${s}\x1b[0m`;
const blue    = (s) => `\x1b[34m${s}\x1b[0m`;
const magenta = (s) => `\x1b[35m${s}\x1b[0m`;

// ─── Available Skills ─────────────────────────────────────────────────────────
const SKILLS = {
  "clean-code-agent": {
    description: "Enforces GoF patterns, SOLID, YAGNI, DRY while writing code",
    languages: ["TypeScript", "Python", "Dart", "Rust", "Go", "Java", "C++"],
    files: [
      "SKILL.md",
      "references/gof-patterns.md",
      "references/solid-checklist.md",
      "references/yagni-dry-rules.md",
      "references/review-template.md",
    ],
  },
};

// ─── IDE Target Definitions ───────────────────────────────────────────────────
// Each IDE defines: where to install (global and/or project), what format to use
//
// Install types:
//   global  → goes into user's home config (applies to ALL projects)
//   project → goes into current working directory (applies to ONE project)
//
function getIDETargets(skillName, skillContent) {
  const home    = os.homedir();
  const cwd     = process.cwd();
  const isWin   = process.platform === "win32";

  return {
    // ── Claude Code ──────────────────────────────────────────────────────────
    claudecode: {
      name: "Claude Code",
      icon: "🤖",
      detect: () => fs.existsSync(path.join(home, ".claude")) || !!process.env.CLAUDE_CODE,
      targets: [
        {
          label: "global (~/.claude/skills/)",
          type: "copy-dir",
          dest: path.join(home, ".claude", "skills", skillName),
          postInstall: `Add to CLAUDE.md:\n     ${cyan(`Read and follow ~/.claude/skills/${skillName}/SKILL.md`)}`,
        },
      ],
    },

    // ── Cursor ───────────────────────────────────────────────────────────────
    // Modern: .cursor/rules/clean-code-agent.mdc  (alwaysApply: true)
    // Legacy: .cursorrules  (still supported)
    cursor: {
      name: "Cursor",
      icon: "⬛",
      detect: () =>
        fs.existsSync(path.join(home, ".cursor")) ||
        fs.existsSync("/Applications/Cursor.app") ||
        fs.existsSync("C:\\Users\\" + os.userInfo().username + "\\AppData\\Local\\Programs\\cursor\\Cursor.exe"),
      targets: [
        {
          label: "project (.cursor/rules/)",
          type: "write-file",
          dest: path.join(cwd, ".cursor", "rules", `${skillName}.mdc`),
          content: `---\ndescription: ${SKILLS[skillName].description}\nalwaysApply: true\n---\n\n${skillContent}`,
          postInstall: `Cursor will auto-load this rule in all AI interactions in this project.`,
        },
        {
          label: "legacy project (.cursorrules)",
          type: "write-file",
          dest: path.join(cwd, ".cursorrules"),
          content: skillContent,
          postInstall: `Legacy .cursorrules file created at project root.`,
          isLegacy: true,
        },
      ],
    },

    // ── Windsurf ─────────────────────────────────────────────────────────────
    // Global: ~/.codeium/windsurf/memories/global_rules.md (appended)
    // Project: .windsurf/rules/<skill>.md
    windsurf: {
      name: "Windsurf",
      icon: "🌊",
      detect: () =>
        fs.existsSync(path.join(home, ".codeium")) ||
        fs.existsSync("/Applications/Windsurf.app") ||
        fs.existsSync(path.join(home, "AppData", "Local", "Programs", "Windsurf", "Windsurf.exe")),
      targets: [
        {
          label: "global (~/.codeium/windsurf/memories/global_rules.md)",
          type: "append-file",
          dest: path.join(home, ".codeium", "windsurf", "memories", "global_rules.md"),
          content: `\n\n<!-- pattern-principal: ${skillName} -->\n${skillContent}`,
          postInstall: `Appended to Windsurf global rules — applies to ALL projects.`,
        },
        {
          label: "project (.windsurf/rules/)",
          type: "write-file",
          dest: path.join(cwd, ".windsurf", "rules", `${skillName}.md`),
          content: skillContent,
          postInstall: `Windsurf project rule created. Cascade will apply it automatically.`,
        },
      ],
    },

    // ── GitHub Copilot (VS Code) ──────────────────────────────────────────────
    // Project: .github/copilot-instructions.md
    // Global:  ~/.config/github-copilot/global-copilot-instructions.md (JetBrains compat)
    copilot: {
      name: "GitHub Copilot",
      icon: "🐙",
      detect: () =>
        fs.existsSync(path.join(home, ".vscode")) ||
        fs.existsSync(path.join(home, ".config", "github-copilot")) ||
        fs.existsSync("/Applications/Visual Studio Code.app") ||
        fs.existsSync(path.join(home, "AppData", "Local", "Programs", "Microsoft VS Code", "Code.exe")),
      targets: [
        {
          label: "project (.github/copilot-instructions.md)",
          type: "append-file",
          dest: path.join(cwd, ".github", "copilot-instructions.md"),
          content: `\n\n<!-- pattern-principal: ${skillName} -->\n${skillContent}`,
          postInstall: `Copilot auto-detects .github/copilot-instructions.md in VS Code.`,
        },
      ],
    },

    // ── Cline ────────────────────────────────────────────────────────────────
    // Project: .clinerules/<skill>.md
    // Global:  ~/.cline/rules/<skill>.md
    cline: {
      name: "Cline",
      icon: "🔷",
      detect: () =>
        fs.existsSync(path.join(home, ".cline")) ||
        fs.existsSync(path.join(cwd, ".clinerules")),
      targets: [
        {
          label: "project (.clinerules/)",
          type: "write-file",
          dest: path.join(cwd, ".clinerules", `${skillName}.md`),
          content: skillContent,
          postInstall: `Cline loads all .md files inside .clinerules/ automatically.`,
        },
        {
          label: "global (~/.cline/rules/)",
          type: "write-file",
          dest: path.join(home, ".cline", "rules", `${skillName}.md`),
          content: skillContent,
          postInstall: `Global Cline rule — applies across all projects.`,
        },
      ],
    },

    // ── Zed ──────────────────────────────────────────────────────────────────
    // Global: ~/.config/zed/AGENTS.md (appended)
    // Project: AGENTS.md at project root
    zed: {
      name: "Zed",
      icon: "⚡",
      detect: () =>
        fs.existsSync(path.join(home, ".config", "zed")) ||
        fs.existsSync("/Applications/Zed.app") ||
        fs.existsSync(path.join(home, "AppData", "Roaming", "Zed")),
      targets: [
        {
          label: "global (~/.config/zed/AGENTS.md)",
          type: "append-file",
          dest: isWin
            ? path.join(process.env.APPDATA || "", "Zed", "AGENTS.md")
            : path.join(home, ".config", "zed", "AGENTS.md"),
          content: `\n\n<!-- pattern-principal: ${skillName} -->\n${skillContent}`,
          postInstall: `Zed personal instructions — applies to every project.`,
        },
        {
          label: "project (AGENTS.md)",
          type: "append-file",
          dest: path.join(cwd, "AGENTS.md"),
          content: `\n\n<!-- pattern-principal: ${skillName} -->\n${skillContent}`,
          postInstall: `Zed project instructions at repo root.`,
        },
      ],
    },

    // ── Continue.dev ─────────────────────────────────────────────────────────
    // Project: .continuerules (legacy) or .continue/rules/<skill>.md
    continue: {
      name: "Continue.dev",
      icon: "▶️",
      detect: () =>
        fs.existsSync(path.join(home, ".continue")) ||
        fs.existsSync(path.join(cwd, ".continuerules")) ||
        fs.existsSync(path.join(cwd, ".continue")),
      targets: [
        {
          label: "project (.continue/rules/)",
          type: "write-file",
          dest: path.join(cwd, ".continue", "rules", `${skillName}.md`),
          content: skillContent,
          postInstall: `Continue.dev will include this rule in all AI interactions.`,
        },
      ],
    },

    // ── Antigravity (Google DeepMind) ─────────────────────────────────────────
    // Rule hierarchy (highest → lowest priority):
    //   1. GEMINI.md       — Antigravity-specific overrides (project root)
    //   2. AGENTS.md       — cross-tool shared rules (project root)
    //   3. .antigravity/rules.md — workspace supplement rules
    //   4. ~/.gemini/GEMINI.md  — global rules (all projects)
    //
    // NOTE: ~/.gemini/GEMINI.md is shared with Gemini CLI — a known conflict.
    // We install to GEMINI.md (project) + .antigravity/rules.md to stay clean.
    antigravity: {
      name: "Antigravity",
      icon: "🪐",
      detect: () =>
        fs.existsSync(path.join(home, ".gemini")) ||
        fs.existsSync("/Applications/Antigravity.app") ||
        fs.existsSync(path.join(home, "AppData", "Local", "Programs", "Antigravity", "Antigravity.exe")) ||
        fs.existsSync(path.join(cwd, ".antigravity")),
      targets: [
        {
          label: "project (GEMINI.md — Antigravity-specific, highest priority)",
          type: "append-file",
          dest: path.join(cwd, "GEMINI.md"),
          content: `\n\n<!-- pattern-principal: ${skillName} -->\n${skillContent}`,
          postInstall: `Antigravity reads GEMINI.md first — these rules take top priority.`,
        },
        {
          label: "project (.antigravity/rules.md — workspace supplement)",
          type: "append-file",
          dest: path.join(cwd, ".antigravity", "rules.md"),
          content: `\n\n<!-- pattern-principal: ${skillName} -->\n${skillContent}`,
          postInstall: `Loaded as workspace supplement rules by Antigravity agent.`,
        },
        {
          label: "global (~/.gemini/GEMINI.md — applies to ALL projects)",
          type: "append-file",
          dest: path.join(home, ".gemini", "GEMINI.md"),
          content: `\n\n<!-- pattern-principal: ${skillName} -->\n<!-- NOTE: also read by Gemini CLI -->\n${skillContent}`,
          postInstall: `Global rules. ⚠️  ~/.gemini/GEMINI.md is shared with Gemini CLI — see README for workaround.`,
        },
      ],
    },

    // ── AGENTS.md (universal standard) ───────────────────────────────────────
    // Works with: Cline, Copilot, Zed, Aider, Antigravity, and any AGENTS.md-compatible tool
    agentsmd: {
      name: "AGENTS.md (Universal)",
      icon: "🌐",
      detect: () => true, // always available
      targets: [
        {
          label: "project (AGENTS.md at project root)",
          type: "append-file",
          dest: path.join(cwd, "AGENTS.md"),
          content: `\n\n<!-- pattern-principal: ${skillName} -->\n${skillContent}`,
          postInstall: `Works with Cline, Copilot, Zed, Aider, and any AGENTS.md-compatible agent.`,
        },
      ],
    },
  };
}

// ─── File Operations ──────────────────────────────────────────────────────────
function writeFile(dest, content) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, content, "utf8");
}

function appendFile(dest, content) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  if (fs.existsSync(dest)) {
    const existing = fs.readFileSync(dest, "utf8");
    if (existing.includes(`pattern-principal: ${content.split("pattern-principal: ")[1]?.split(" -->")[0]}`)) {
      return "already-installed";
    }
    fs.appendFileSync(dest, content, "utf8");
  } else {
    fs.writeFileSync(dest, content.trimStart(), "utf8");
  }
  return "ok";
}

function copyDir(src, dest) {
  if (!fs.existsSync(src)) throw new Error(`Source not found: ${src}`);
  fs.mkdirSync(dest, { recursive: true });
  for (const item of fs.readdirSync(src)) {
    const s = path.join(src, item);
    const d = path.join(dest, item);
    fs.statSync(s).isDirectory() ? copyDir(s, d) : fs.copyFileSync(s, d);
  }
}

function skillSourceDir(skillName) {
  return path.join(__dirname, "..", skillName);
}

function readSkillContent(skillName) {
  const skillMd = path.join(skillSourceDir(skillName), "SKILL.md");
  if (!fs.existsSync(skillMd)) throw new Error(`SKILL.md not found at ${skillMd}`);
  return fs.readFileSync(skillMd, "utf8");
}

// ─── Auto-detect installed IDEs ───────────────────────────────────────────────
function detectIDEs(ideTargets) {
  return Object.entries(ideTargets)
    .filter(([, ide]) => { try { return ide.detect(); } catch { return false; } })
    .map(([id, ide]) => ({ id, ...ide }));
}

// ─── Banner ───────────────────────────────────────────────────────────────────
function printBanner() {
  console.log();
  console.log(bold(cyan("  ╔═══════════════════════════════════════════╗")));
  console.log(bold(cyan("  ║       pattern-principal  installer        ║")));
  console.log(bold(cyan("  ╚═══════════════════════════════════════════╝")));
  console.log();
}

// ─── Commands ─────────────────────────────────────────────────────────────────

function cmdList() {
  printBanner();
  console.log(bold("  Available Skills\n"));
  for (const [name, skill] of Object.entries(SKILLS)) {
    console.log(`  ${bold(cyan(name))}`);
    console.log(`  ${dim(skill.description)}`);
    console.log(`  ${dim("Languages: " + skill.languages.join(", "))}\n`);
  }
  console.log(dim("  Usage:"));
  console.log(`  ${cyan("npx pattern-principal install <skill>")}`);
  console.log(`  ${cyan("npx pattern-principal install <skill> --ide cursor")}`);
  console.log(`  ${cyan("npx pattern-principal install <skill> --ide all")}\n`);
}

function cmdInstall(args) {
  printBanner();

  const skillName = args.find((a) => !a.startsWith("--"));
  const ideFlag   = args.find((a) => a.startsWith("--ide=") || a === "--ide");
  const ideValue  = ideFlag
    ? (ideFlag.includes("=") ? ideFlag.split("=")[1] : args[args.indexOf(ideFlag) + 1])
    : null;

  if (!skillName || !SKILLS[skillName]) {
    console.log(bold("  Available skills:\n"));
    for (const [name, skill] of Object.entries(SKILLS)) {
      console.log(`  ${cyan(name)} — ${dim(skill.description)}`);
    }
    console.log(`\n  ${dim("Usage: npx pattern-principal install <skill-name>")}\n`);
    process.exit(0);
  }

  let skillContent;
  try {
    skillContent = readSkillContent(skillName);
  } catch (err) {
    console.log(red(`  ✗ Could not read skill: ${err.message}\n`));
    process.exit(1);
  }

  const allIDETargets = getIDETargets(skillName, skillContent);

  // Determine which IDEs to install to
  let selectedIDEs;
  if (!ideValue || ideValue === "auto") {
    selectedIDEs = detectIDEs(allIDETargets);
    console.log(`  ${bold("Mode:")} ${cyan("auto-detect")}\n`);
  } else if (ideValue === "all") {
    selectedIDEs = Object.entries(allIDETargets).map(([id, ide]) => ({ id, ...ide }));
    console.log(`  ${bold("Mode:")} ${cyan("all IDEs")}\n`);
  } else {
    const ids = ideValue.split(",").map((s) => s.trim());
    selectedIDEs = ids
      .filter((id) => allIDETargets[id])
      .map((id) => ({ id, ...allIDETargets[id] }));
    const unknown = ids.filter((id) => !allIDETargets[id]);
    if (unknown.length) {
      console.log(yellow(`  ⚠ Unknown IDE(s): ${unknown.join(", ")}`));
      console.log(dim(`    Available: ${Object.keys(allIDETargets).join(", ")}\n`));
    }
  }

  if (selectedIDEs.length === 0) {
    console.log(yellow("  ⚠ No IDEs detected on this machine.\n"));
    console.log(dim("  Specify an IDE manually:"));
    console.log(`  ${cyan(`npx pattern-principal install ${skillName} --ide cursor`)}\n`);
    console.log(dim("  Available targets: ") + Object.keys(allIDETargets).join(", ") + "\n");
    process.exit(0);
  }

  console.log(`  ${bold("Installing:")} ${cyan(skillName)}\n`);

  for (const ide of selectedIDEs) {
    console.log(`  ${ide.icon} ${bold(ide.name)}`);

    for (const target of ide.targets) {
      if (target.isLegacy) continue; // skip legacy by default

      process.stdout.write(`     ${dim("→")} ${target.label} ... `);

      try {
        let result = "ok";

        if (target.type === "copy-dir") {
          copyDir(skillSourceDir(skillName), target.dest);
        } else if (target.type === "write-file") {
          writeFile(target.dest, target.content);
        } else if (target.type === "append-file") {
          result = appendFile(target.dest, target.content);
        }

        if (result === "already-installed") {
          console.log(dim("already installed"));
        } else {
          console.log(green("✓"));
          console.log(`     ${dim(target.postInstall)}`);
        }
      } catch (err) {
        console.log(red("✗ " + err.message));
      }
    }
    console.log();
  }

  console.log(bold(green("  ✓ Done!\n")));
  console.log(dim("  Tip: run with --ide all to install for every supported IDE"));
  console.log(dim("       run with --ide cursor,windsurf to target specific IDEs\n"));
}

function cmdUninstall(args) {
  printBanner();

  const skillName  = args.find((a) => !a.startsWith("--"));
  const ideFlag    = args.find((a) => a.startsWith("--ide=") || a === "--ide");
  const ideValue   = ideFlag
    ? (ideFlag.includes("=") ? ideFlag.split("=")[1] : args[args.indexOf(ideFlag) + 1])
    : "all";

  if (!skillName) {
    console.log(red("  Specify a skill: npx pattern-principal uninstall <skill>\n"));
    process.exit(1);
  }

  const allIDETargets = getIDETargets(skillName, "");

  const selectedIDEs = ideValue === "all"
    ? Object.entries(allIDETargets).map(([id, ide]) => ({ id, ...ide }))
    : ideValue.split(",").map((id) => ({ id, ...allIDETargets[id.trim()] })).filter((i) => i.name);

  for (const ide of selectedIDEs) {
    console.log(`  ${ide.icon} ${bold(ide.name)}`);
    for (const target of ide.targets) {
      if (!fs.existsSync(target.dest)) {
        console.log(`     ${dim("→")} ${target.label} — ${dim("not found, skipping")}`);
        continue;
      }
      process.stdout.write(`     ${dim("→")} ${target.label} ... `);
      try {
        const stat = fs.statSync(target.dest);
        if (stat.isDirectory()) {
          fs.rmSync(target.dest, { recursive: true, force: true });
        } else {
          // For appended files, remove the section; for written files, delete
          if (target.type === "append-file") {
            let content = fs.readFileSync(target.dest, "utf8");
            content = content.replace(
              new RegExp(`\\n\\n<!-- pattern-principal: ${skillName} -->.*`, "s"),
              ""
            );
            fs.writeFileSync(target.dest, content, "utf8");
          } else {
            fs.rmSync(target.dest, { force: true });
          }
        }
        console.log(green("✓ removed"));
      } catch (err) {
        console.log(red("✗ " + err.message));
      }
    }
    console.log();
  }
}

function cmdIDEs() {
  printBanner();
  console.log(bold("  Supported IDEs & Rule File Locations\n"));

  const table = [
    ["claudecode", "🤖", "Claude Code",       "~/.claude/skills/<skill>/",                    "global"],
    ["cursor",     "⬛", "Cursor",             ".cursor/rules/<skill>.mdc",                    "project"],
    ["windsurf",   "🌊", "Windsurf",           ".windsurf/rules/<skill>.md",                   "project"],
    ["windsurf",   "🌊", "Windsurf (global)",  "~/.codeium/windsurf/memories/global_rules.md", "global"],
    ["copilot",    "🐙", "GitHub Copilot",     ".github/copilot-instructions.md",              "project"],
    ["cline",      "🔷", "Cline",              ".clinerules/<skill>.md",                       "project"],
    ["cline",      "🔷", "Cline (global)",     "~/.cline/rules/<skill>.md",                    "global"],
    ["zed",        "⚡", "Zed",               "AGENTS.md or ~/.config/zed/AGENTS.md",          "both"],
    ["continue",   "▶️", "Continue.dev",       ".continue/rules/<skill>.md",                   "project"],
    ["antigravity","🪐", "Antigravity",        "GEMINI.md + .antigravity/rules.md",             "project"],
    ["antigravity","🪐", "Antigravity (global)","~/.gemini/GEMINI.md",                          "global"],
    ["agentsmd",   "🌐", "AGENTS.md",          "AGENTS.md (universal standard)",               "project"],
  ];

  for (const [id, icon, name, location, scope] of table) {
    console.log(`  ${icon} ${bold(name.padEnd(22))} ${cyan(location)}`);
    console.log(`     ${dim("scope: " + scope + " | --ide flag: " + id)}\n`);
  }

  console.log(dim("  Install to specific IDE:"));
  console.log(`  ${cyan("npx pattern-principal install clean-code-agent --ide cursor")}`);
  console.log(`  ${cyan("npx pattern-principal install clean-code-agent --ide cursor,windsurf")}`);
  console.log(`  ${cyan("npx pattern-principal install clean-code-agent --ide all")}\n`);
}

function cmdHelp() {
  printBanner();
  console.log(bold("  Usage\n"));
  console.log(`  ${cyan("npx pattern-principal list")}                              List available skills`);
  console.log(`  ${cyan("npx pattern-principal ides")}                              List supported IDEs`);
  console.log(`  ${cyan("npx pattern-principal install <skill>")}                   Auto-detect & install`);
  console.log(`  ${cyan("npx pattern-principal install <skill> --ide all")}         Install for all IDEs`);
  console.log(`  ${cyan("npx pattern-principal install <skill> --ide cursor")}      Install for Cursor only`);
  console.log(`  ${cyan("npx pattern-principal install <skill> --ide cursor,zed")}  Install for multiple`);
  console.log(`  ${cyan("npx pattern-principal uninstall <skill>")}                 Remove from all IDEs`);
  console.log(`  ${cyan("npx pattern-principal uninstall <skill> --ide windsurf")}  Remove from one IDE`);
  console.log();
  console.log(bold("  Supported IDEs\n"));
  console.log(`  ${["claudecode","cursor","windsurf","copilot","cline","zed","continue","antigravity","agentsmd"].join("  ")}\n`);
}

// ─── Router ───────────────────────────────────────────────────────────────────
const [,, command, ...rest] = process.argv;

switch (command) {
  case "install":   cmdInstall(rest);  break;
  case "uninstall": cmdUninstall(rest); break;
  case "list":      cmdList();          break;
  case "ides":      cmdIDEs();          break;
  case "help":
  case "--help":
  case "-h":        cmdHelp();          break;
  default:
    if (!command) cmdHelp();
    else {
      console.log(red(`\n  Unknown command: ${command}`));
      console.log(dim(`  Run: npx pattern-principal help\n`));
      process.exit(1);
    }
}
