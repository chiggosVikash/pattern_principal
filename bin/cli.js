#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const os = require("os");

// ─── ANSI Colors ────────────────────────────────────────────────────────────
const c = {
  reset:  "\x1b[0m",
  bold:   "\x1b[1m",
  dim:    "\x1b[2m",
  green:  "\x1b[32m",
  cyan:   "\x1b[36m",
  yellow: "\x1b[33m",
  red:    "\x1b[31m",
  blue:   "\x1b[34m",
  magenta:"\x1b[35m",
};

const bold   = (s) => `${c.bold}${s}${c.reset}`;
const green  = (s) => `${c.green}${s}${c.reset}`;
const cyan   = (s) => `${c.cyan}${s}${c.reset}`;
const yellow = (s) => `${c.yellow}${s}${c.reset}`;
const red    = (s) => `${c.red}${s}${c.reset}`;
const dim    = (s) => `${c.dim}${s}${c.reset}`;
const blue   = (s) => `${c.blue}${s}${c.reset}`;

// ─── Available Skills ────────────────────────────────────────────────────────
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

// ─── Install Targets ─────────────────────────────────────────────────────────
function getInstallTargets() {
  const home = os.homedir();
  return [
    {
      name: "Claude Desktop / Claude.ai Projects",
      path: path.join(home, ".claude", "skills"),
    },
    {
      name: "Claude Code (global)",
      path: path.join(home, ".claude", "skills"),
    },
  ];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function copyRecursive(src, dest) {
  if (!fs.existsSync(src)) return;
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const child of fs.readdirSync(src)) {
      copyRecursive(path.join(src, child), path.join(dest, child));
    }
  } else {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }
}

function skillSourceDir(skillName) {
  // Works both when run via npx (from package root) and locally
  return path.join(__dirname, "..", skillName);
}

function printBanner() {
  console.log();
  console.log(bold(cyan("  ╔═══════════════════════════════════════╗")));
  console.log(bold(cyan("  ║      pattern-principal installer      ║")));
  console.log(bold(cyan("  ╚═══════════════════════════════════════╝")));
  console.log();
}

function printSkillCard(name, skill) {
  console.log(`  ${bold(cyan(name))}`);
  console.log(`  ${dim(skill.description)}`);
  console.log(`  ${dim("Languages: " + skill.languages.join(", "))}`);
  console.log();
}

// ─── Commands ────────────────────────────────────────────────────────────────

function cmdList() {
  printBanner();
  console.log(bold("  Available Skills\n"));
  for (const [name, skill] of Object.entries(SKILLS)) {
    printSkillCard(name, skill);
  }
  console.log(dim("  Install with: ") + cyan("npx pattern-principal install <skill-name>"));
  console.log(dim("  Install all:  ") + cyan("npx pattern-principal install --all"));
  console.log();
}

function cmdInstall(args) {
  printBanner();

  const installAll = args.includes("--all");
  const targetSkills = installAll
    ? Object.keys(SKILLS)
    : args.filter((a) => !a.startsWith("--"));

  if (targetSkills.length === 0) {
    console.log(bold("  Available skills:\n"));
    for (const [name, skill] of Object.entries(SKILLS)) {
      printSkillCard(name, skill);
    }
    console.log(dim("  Usage: ") + cyan("npx pattern-principal install <skill-name>"));
    console.log(dim("         ") + cyan("npx pattern-principal install --all"));
    console.log();
    process.exit(0);
  }

  const installBase = path.join(os.homedir(), ".claude", "skills");

  console.log(`  ${bold("Install location:")} ${cyan(installBase)}\n`);

  let successCount = 0;

  for (const skillName of targetSkills) {
    if (!SKILLS[skillName]) {
      console.log(`  ${red("✗")} ${bold(skillName)} — not found`);
      console.log(`    ${dim("Available: " + Object.keys(SKILLS).join(", "))}\n`);
      continue;
    }

    const skill = SKILLS[skillName];
    const src  = skillSourceDir(skillName);
    const dest = path.join(installBase, skillName);

    process.stdout.write(`  ${yellow("→")} Installing ${bold(skillName)}...`);

    try {
      // Verify source exists
      if (!fs.existsSync(src)) {
        console.log(` ${red("✗ source not found")}`);
        console.log(`    ${dim("Expected: " + src)}`);
        continue;
      }

      // Copy skill directory
      copyRecursive(src, dest);

      // Verify installed files
      const missing = skill.files.filter(
        (f) => !fs.existsSync(path.join(dest, f))
      );

      if (missing.length > 0) {
        console.log(` ${yellow("⚠ partial install")}`);
        console.log(`    ${dim("Missing: " + missing.join(", "))}`);
      } else {
        console.log(` ${green("✓ done")}`);
      }

      // Print installed files
      for (const f of skill.files) {
        console.log(`    ${dim("•")} ${dim(f)}`);
      }
      console.log();

      successCount++;
    } catch (err) {
      console.log(` ${red("✗ failed")}`);
      console.log(`    ${red(err.message)}\n`);
    }
  }

  // ─── Post-install instructions ──────────────────────────────────────────
  if (successCount > 0) {
    console.log(bold(green("  ✓ Installation complete!\n")));
    console.log(bold("  How to use:\n"));

    console.log(`  ${bold(blue("1. Claude.ai Projects"))}`);
    console.log(`     Open a Project → Custom Instructions → paste contents of:`);
    console.log(`     ${cyan(path.join(installBase, "clean-code-agent", "SKILL.md"))}\n`);

    console.log(`  ${bold(blue("2. Claude Code"))}`);
    console.log(`     Add to your ${cyan("CLAUDE.md")} in project root:`);
    console.log(`     ${dim("---")}`);
    console.log(`     ${cyan('Read and follow ~/.claude/skills/clean-code-agent/SKILL.md')}`);
    console.log(`     ${dim("---\n")}`);

    console.log(`  ${bold(blue("3. Any AI Agent / MCP"))}`);
    console.log(`     Reference the skill path in your system prompt:`);
    console.log(`     ${cyan(path.join(installBase, "clean-code-agent", "SKILL.md"))}\n`);

    console.log(dim("  Skill location: ") + cyan(installBase));
    console.log(dim("  Uninstall:      ") + cyan("npx pattern-principal uninstall clean-code-agent"));
    console.log();
  }
}

function cmdUninstall(args) {
  printBanner();

  const uninstallAll = args.includes("--all");
  const targetSkills = uninstallAll
    ? Object.keys(SKILLS)
    : args.filter((a) => !a.startsWith("--"));

  if (targetSkills.length === 0) {
    console.log(red("  Specify a skill to uninstall or use --all\n"));
    process.exit(1);
  }

  const installBase = path.join(os.homedir(), ".claude", "skills");

  for (const skillName of targetSkills) {
    const dest = path.join(installBase, skillName);
    process.stdout.write(`  ${yellow("→")} Uninstalling ${bold(skillName)}...`);

    if (!fs.existsSync(dest)) {
      console.log(` ${dim("not installed, skipping")}`);
      continue;
    }

    try {
      fs.rmSync(dest, { recursive: true, force: true });
      console.log(` ${green("✓ removed")}`);
    } catch (err) {
      console.log(` ${red("✗ failed: " + err.message)}`);
    }
  }
  console.log();
}

function cmdInfo(args) {
  const skillName = args[0];
  if (!skillName || !SKILLS[skillName]) {
    console.log(red(`\n  Skill not found: ${skillName}`));
    console.log(dim(`  Available: ${Object.keys(SKILLS).join(", ")}\n`));
    process.exit(1);
  }

  printBanner();
  const skill = SKILLS[skillName];
  const installBase = path.join(os.homedir(), ".claude", "skills");
  const installed = fs.existsSync(path.join(installBase, skillName, "SKILL.md"));

  console.log(`  ${bold(cyan(skillName))}`);
  console.log(`  ${dim(skill.description)}\n`);
  console.log(`  ${bold("Languages:")} ${skill.languages.join(", ")}`);
  console.log(`  ${bold("Status:")}    ${installed ? green("✓ installed") : yellow("not installed")}`);

  if (installed) {
    console.log(`  ${bold("Location:")}  ${cyan(path.join(installBase, skillName))}`);
  }

  console.log(`\n  ${bold("Files:")}`);
  for (const f of skill.files) {
    const exists = fs.existsSync(path.join(installBase, skillName, f));
    const icon = installed ? (exists ? green("✓") : red("✗")) : dim("•");
    console.log(`    ${icon} ${f}`);
  }
  console.log();
}

function cmdHelp() {
  printBanner();
  console.log(bold("  Usage\n"));
  console.log(`  ${cyan("npx pattern-principal list")}                    List all available skills`);
  console.log(`  ${cyan("npx pattern-principal install <skill>")}         Install a skill`);
  console.log(`  ${cyan("npx pattern-principal install --all")}           Install all skills`);
  console.log(`  ${cyan("npx pattern-principal uninstall <skill>")}       Remove a skill`);
  console.log(`  ${cyan("npx pattern-principal info <skill>")}            Show skill details`);
  console.log(`  ${cyan("npx pattern-principal help")}                    Show this help`);
  console.log();
  console.log(bold("  Available Skills\n"));
  for (const [name, skill] of Object.entries(SKILLS)) {
    printSkillCard(name, skill);
  }
}

// ─── Router ──────────────────────────────────────────────────────────────────
const [,, command, ...rest] = process.argv;

switch (command) {
  case "install":    cmdInstall(rest);   break;
  case "uninstall":  cmdUninstall(rest); break;
  case "list":       cmdList();          break;
  case "info":       cmdInfo(rest);      break;
  case "help":
  case "--help":
  case "-h":         cmdHelp();          break;
  default:
    if (!command) {
      cmdHelp();
    } else {
      console.log(red(`\n  Unknown command: ${command}`));
      console.log(dim(`  Run: npx pattern-principal help\n`));
      process.exit(1);
    }
}
