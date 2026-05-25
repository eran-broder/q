#!/usr/bin/env node
// Cross-platform uninstaller for q.
// Removes everything install.js created. Idempotent.

"use strict";
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const HOME = os.homedir();
const Q_DIR = path.join(HOME, ".claude", "q");
const BIN_DIR = path.join(HOME, ".local", "bin");
const CLAUDE_DIR = path.join(HOME, ".claude");
const USER_CLAUDE_MD = path.join(CLAUDE_DIR, "CLAUDE.md");
const SETTINGS_FILE = path.join(CLAUDE_DIR, "settings.json");

const HOOK_CMD = 'node "$HOME/.claude/q/hook-stop.js"';
const IMPORT_LINE = "@~/.claude/q/CLAUDE.md";

const KEEP_SESSIONS =
  process.argv.includes("--keep-sessions") || process.argv.includes("-k");

function log(msg) {
  process.stdout.write(`  ${msg}\n`);
}
function head(msg) {
  process.stdout.write(`\n${msg}\n`);
}

function removeQDir() {
  head("[1/4] removing ~/.claude/q/");
  if (!fs.existsSync(Q_DIR)) {
    log("not present");
    return;
  }
  // Preserve session queue files if -k flag.
  const sessionsDir = path.join(Q_DIR, "sessions");
  let preserved = null;
  if (KEEP_SESSIONS && fs.existsSync(sessionsDir)) {
    preserved = path.join(HOME, ".claude", `q-sessions-backup-${Date.now()}`);
    fs.renameSync(sessionsDir, preserved);
  }
  fs.rmSync(Q_DIR, { recursive: true, force: true });
  log(`removed ${Q_DIR}`);
  if (preserved) {
    log(`session queues backed up to ${preserved}`);
  }
}

function removeShims() {
  head("[2/4] removing CLI shims from ~/.local/bin/");
  for (const name of ["q", "q.cmd"]) {
    const p = path.join(BIN_DIR, name);
    if (fs.existsSync(p)) {
      fs.unlinkSync(p);
      log(`removed ${p}`);
    }
  }
}

function removeAwareness() {
  head("[3/4] removing @import from ~/.claude/CLAUDE.md");
  if (!fs.existsSync(USER_CLAUDE_MD)) {
    log("not present");
    return;
  }
  const content = fs.readFileSync(USER_CLAUDE_MD, "utf8");
  const lines = content.split(/\r?\n/);
  const filtered = lines.filter((line, i) => {
    if (line.trim() === IMPORT_LINE) return false;
    // Also drop the comment line we wrote above the import, if present.
    if (
      line.startsWith("# q queue awareness (managed by github.com/eran-broder/q") &&
      lines[i + 1] &&
      lines[i + 1].trim() === IMPORT_LINE
    ) {
      return false;
    }
    return true;
  });
  if (filtered.length === lines.length) {
    log("nothing to remove");
    return;
  }
  // Collapse trailing blank lines.
  while (filtered.length && filtered[filtered.length - 1].trim() === "") {
    filtered.pop();
  }
  const out = filtered.length === 0 ? "" : filtered.join("\n") + "\n";
  if (out.trim() === "") {
    fs.unlinkSync(USER_CLAUDE_MD);
    log(`removed empty ${USER_CLAUDE_MD}`);
  } else {
    fs.writeFileSync(USER_CLAUDE_MD, out, "utf8");
    log(`updated ${USER_CLAUDE_MD}`);
  }
}

function removeHook() {
  head("[4/4] removing Stop hook from ~/.claude/settings.json");
  if (!fs.existsSync(SETTINGS_FILE)) {
    log("not present");
    return;
  }
  let settings;
  try {
    settings = JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf8"));
  } catch {
    log("settings.json is not valid JSON — skipping");
    return;
  }
  if (!settings || !settings.hooks || !Array.isArray(settings.hooks.Stop)) {
    log("no Stop hook to remove");
    return;
  }

  const before = JSON.stringify(settings.hooks.Stop);
  settings.hooks.Stop = settings.hooks.Stop
    .map((group) => {
      if (!Array.isArray(group.hooks)) return group;
      const remaining = group.hooks.filter(
        (h) => !(h && h.type === "command" && h.command === HOOK_CMD)
      );
      return remaining.length === 0 ? null : { ...group, hooks: remaining };
    })
    .filter(Boolean);
  if (settings.hooks.Stop.length === 0) {
    delete settings.hooks.Stop;
  }
  if (Object.keys(settings.hooks).length === 0) {
    delete settings.hooks;
  }
  const after = JSON.stringify(settings.hooks && settings.hooks.Stop);
  if (before === after) {
    log("nothing to remove");
    return;
  }
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2) + "\n", "utf8");
  log(`updated ${SETTINGS_FILE}`);
}

function main() {
  process.stdout.write(`Uninstalling q from ${HOME}...\n`);
  if (KEEP_SESSIONS) {
    process.stdout.write(`  (session queues will be preserved)\n`);
  }
  try {
    removeQDir();
    removeShims();
    removeAwareness();
    removeHook();
  } catch (e) {
    process.stderr.write(`\nUNINSTALL FAILED: ${e.message}\n`);
    process.exit(1);
  }
  process.stdout.write(`\n✓ q uninstalled.\n`);
}

main();
