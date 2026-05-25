#!/usr/bin/env node
// Cross-platform installer for the q queue tool.
//
// Installs:
//   ~/.claude/q/queue.js                    (the CLI)
//   ~/.claude/q/hook-stop.js                (the Stop hook script)
//   ~/.claude/q/CLAUDE.md                   (Claude awareness fragment)
//   ~/.local/bin/q                          (bash shim)
//   ~/.local/bin/q.cmd                      (Windows shim, for cmd/PowerShell)
//
// Modifies (idempotent):
//   ~/.claude/CLAUDE.md                     (appends @~/.claude/q/CLAUDE.md import)
//   ~/.claude/settings.json                 (adds Stop hook with asyncRewake)
//
// Run again to upgrade — every step is idempotent.

"use strict";
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const SRC_DIR = __dirname;
const HOME = os.homedir();
const Q_DIR = path.join(HOME, ".claude", "q");
const BIN_DIR = path.join(HOME, ".local", "bin");
const CLAUDE_DIR = path.join(HOME, ".claude");
const USER_CLAUDE_MD = path.join(CLAUDE_DIR, "CLAUDE.md");
const SETTINGS_FILE = path.join(CLAUDE_DIR, "settings.json");

const IS_WINDOWS = process.platform === "win32";
const HOOK_CMD = 'node "$HOME/.claude/q/hook-stop.js"';
const IMPORT_LINE = "@~/.claude/q/CLAUDE.md";

function log(msg) {
  process.stdout.write(`  ${msg}\n`);
}
function head(msg) {
  process.stdout.write(`\n${msg}\n`);
}

// --- step 1: node ----------------------------------------------------------
function checkNode() {
  head("[1/5] checking node");
  const ver = process.versions.node.split(".").map(Number);
  if (ver[0] < 20) {
    throw new Error(`node >=20 required (have ${process.versions.node})`);
  }
  log(`node ${process.versions.node} ✓`);
}

// --- step 2: copy files ----------------------------------------------------
function copyFile(name, dest) {
  fs.copyFileSync(path.join(SRC_DIR, name), dest);
  try {
    fs.chmodSync(dest, 0o755);
  } catch {
    /* windows: chmod is a no-op, ignore */
  }
}

function installFiles() {
  head("[2/5] installing files to ~/.claude/q/");
  fs.mkdirSync(Q_DIR, { recursive: true });
  copyFile("queue.js", path.join(Q_DIR, "queue.js"));
  log(`${Q_DIR}/queue.js`);
  copyFile("hook-stop.js", path.join(Q_DIR, "hook-stop.js"));
  log(`${Q_DIR}/hook-stop.js`);
  copyFile("CLAUDE.md", path.join(Q_DIR, "CLAUDE.md"));
  log(`${Q_DIR}/CLAUDE.md`);
}

// --- step 3: PATH shims ----------------------------------------------------
function installShims() {
  head("[3/5] installing CLI shims to ~/.local/bin/");
  fs.mkdirSync(BIN_DIR, { recursive: true });

  const bashShim = `#!/usr/bin/env bash\nexec node "$HOME/.claude/q/queue.js" "$@"\n`;
  const bashPath = path.join(BIN_DIR, "q");
  fs.writeFileSync(bashPath, bashShim, "utf8");
  try {
    fs.chmodSync(bashPath, 0o755);
  } catch {}
  log(`${bashPath}`);

  if (IS_WINDOWS) {
    const cmdShim = `@echo off\nnode "%USERPROFILE%\\.claude\\q\\queue.js" %*\n`;
    const cmdPath = path.join(BIN_DIR, "q.cmd");
    fs.writeFileSync(cmdPath, cmdShim, "utf8");
    log(`${cmdPath}`);
  }

  // Verify PATH
  const pathSep = IS_WINDOWS ? ";" : ":";
  const onPath = (process.env.PATH || "")
    .split(pathSep)
    .some(
      (p) => path.resolve(p).toLowerCase() === path.resolve(BIN_DIR).toLowerCase()
    );
  if (!onPath) {
    process.stdout.write(
      `\n  ⚠  ${BIN_DIR} is not on your PATH.\n` +
        (IS_WINDOWS
          ? `     Add it via System Properties → Environment Variables, or:\n` +
            `       setx PATH "%PATH%;${BIN_DIR}"\n` +
            `     then restart your terminal.\n`
          : `     Add this line to ~/.bashrc, ~/.zshrc, or your shell init:\n` +
            `       export PATH="$HOME/.local/bin:$PATH"\n` +
            `     then restart your terminal or \`source\` the file.\n`)
    );
  } else {
    log(`PATH ✓ (${BIN_DIR} is on PATH)`);
  }
}

// --- step 4: CLAUDE.md import ---------------------------------------------
function installAwareness() {
  head("[4/5] wiring awareness into ~/.claude/CLAUDE.md");
  fs.mkdirSync(CLAUDE_DIR, { recursive: true });

  let content = "";
  if (fs.existsSync(USER_CLAUDE_MD)) {
    content = fs.readFileSync(USER_CLAUDE_MD, "utf8");
  }

  if (content.split(/\r?\n/).some((line) => line.trim() === IMPORT_LINE)) {
    log(`already importing ${IMPORT_LINE} — skipping`);
    return;
  }

  const sep = content.length === 0 || content.endsWith("\n") ? "" : "\n";
  const append = `${sep}\n# q queue awareness (managed by github.com/eran-broder/q — remove this line to disable)\n${IMPORT_LINE}\n`;
  fs.writeFileSync(USER_CLAUDE_MD, content + append, "utf8");
  log(`appended @import to ${USER_CLAUDE_MD}`);
}

// --- step 5: settings.json Stop hook --------------------------------------
function installHook() {
  head("[5/5] adding Stop hook to ~/.claude/settings.json");
  let settings = {};
  if (fs.existsSync(SETTINGS_FILE)) {
    try {
      settings = JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf8"));
    } catch (e) {
      throw new Error(
        `${SETTINGS_FILE} is not valid JSON — refusing to overwrite. Fix it first.\n  (${e.message})`
      );
    }
  }
  if (typeof settings !== "object" || Array.isArray(settings) || settings === null) {
    throw new Error(`${SETTINGS_FILE} is not a JSON object`);
  }

  settings.hooks = settings.hooks || {};
  settings.hooks.Stop = settings.hooks.Stop || [];

  const alreadyHas = settings.hooks.Stop.some(
    (group) =>
      Array.isArray(group.hooks) &&
      group.hooks.some((h) => h && h.type === "command" && h.command === HOOK_CMD)
  );

  if (alreadyHas) {
    log(`hook already present — skipping`);
    return;
  }

  settings.hooks.Stop.push({
    hooks: [
      {
        type: "command",
        command: HOOK_CMD,
        asyncRewake: true,
      },
    ],
  });
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2) + "\n", "utf8");
  log(`added Stop hook to ${SETTINGS_FILE}`);
}

// --- main ------------------------------------------------------------------
function main() {
  process.stdout.write(`Installing q to ${HOME}...\n`);
  try {
    checkNode();
    installFiles();
    installShims();
    installAwareness();
    installHook();
  } catch (e) {
    process.stderr.write(`\nINSTALL FAILED: ${e.message}\n`);
    process.exit(1);
  }
  process.stdout.write(
    `\n✓ q installed.\n\n` +
      `Try it:\n` +
      `  q "my first follow-up"\n` +
      `  q                              # list\n` +
      `  q -peek                        # see next\n` +
      `  q -where                       # see queue file path\n\n` +
      `Restart any active Claude Code session for the Stop hook to take effect.\n`
  );
}

main();
