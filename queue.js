#!/usr/bin/env node
"use strict";

// Follow-up queue, scoped to the current Claude Code session when available.
//
// Inside a Claude Code session (env CLAUDE_CODE_SESSION_ID set):
//   queue file = ~/.claude/q/sessions/<session-id>.json   (per-session, isolated)
// Outside (no env var):
//   queue file = .claude/followups.json                   (cwd-relative)

const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const HELP = `Follow-up queue, scoped to the current Claude Code session when available.

Inside a Claude Code session (env CLAUDE_CODE_SESSION_ID set):
  queue file = ~/.claude/q/sessions/<session-id>.json   (per-session, isolated)
Outside (no env var):
  queue file = .claude/followups.json                   (cwd-relative)

Usage:
  q <text...>     Push <text> onto the queue (default action).
  q -peek         Show next item without removing.
  q -list         List all items, oldest first. Same as bare \`q\`.
  q -count        Print integer queue length.
  q -clear        Empty the queue.
  q -pop          Remove and return the oldest item.
  q -where        Print the resolved queue file path and scope.
  q -h, --help    Show this help.

Exit codes: 0 success, 1 queue empty (for -peek / -pop), 2 usage error.

Pop output is two lines for machine parsing:
  Starting: <text>  (N left in queue)
  ::TEXT::<text>`;

function queuePath() {
  const sid = process.env.CLAUDE_CODE_SESSION_ID;
  if (sid) {
    return path.join(os.homedir(), ".claude", "q", "sessions", `${sid}.json`);
  }
  return path.join(".claude", "followups.json");
}

function load(p) {
  if (!fs.existsSync(p)) return [];
  let raw;
  try {
    raw = fs.readFileSync(p, "utf8");
  } catch {
    return [];
  }
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    const backup = p.replace(/\.json$/, ".json.corrupted");
    fs.renameSync(p, backup);
    console.error(`warning: queue file was corrupted, backed up to ${backup}`);
    return [];
  }
  if (!Array.isArray(data)) {
    console.error(`queue file is not a JSON array: ${p}`);
    process.exit(2);
  }
  return data;
}

function save(p, items) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(items, null, 2) + "\n", "utf8");
}

function nowIso() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

function cmdPush(text) {
  text = text.trim();
  if (!text) {
    console.error("error: push requires non-empty text");
    return 2;
  }
  const p = queuePath();
  const items = load(p);
  items.push({ text, added_at: nowIso() });
  save(p, items);
  console.log(`Queued: ${text}  (${items.length} in queue)`);
  return 0;
}

function cmdPop() {
  const p = queuePath();
  const items = load(p);
  if (items.length === 0) {
    console.log("Queue is empty.");
    return 1;
  }
  const top = items.shift();
  save(p, items);
  console.log(`Starting: ${top.text}  (${items.length} left in queue)`);
  console.log(`::TEXT::${top.text}`);
  return 0;
}

function cmdPeek() {
  const items = load(queuePath());
  if (items.length === 0) {
    console.log("Queue is empty.");
    return 1;
  }
  console.log(`Next: ${items[0].text}  (${items.length} in queue)`);
  return 0;
}

function cmdList() {
  const items = load(queuePath());
  if (items.length === 0) {
    console.log("Queue is empty.");
    return 0;
  }
  items.forEach((it, i) => {
    console.log(`${i + 1}. ${it.text}  (added ${it.added_at})`);
  });
  return 0;
}

function cmdCount() {
  console.log(load(queuePath()).length);
  return 0;
}

function cmdClear() {
  save(queuePath(), []);
  console.log("Queue cleared.");
  return 0;
}

function cmdWhere() {
  const p = queuePath();
  const sid = process.env.CLAUDE_CODE_SESSION_ID;
  const scope = sid ? `session=${sid}` : "cwd-scoped (no CLAUDE_CODE_SESSION_ID)";
  const exists = fs.existsSync(p) ? "exists" : "not yet created";
  console.log(`${p}  [${scope}, ${exists}]`);
  return 0;
}

const FLAG_HANDLERS = {
  peek: cmdPeek,
  list: cmdList,
  count: cmdCount,
  clear: cmdClear,
  pop: cmdPop,
  where: cmdWhere,
};

function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) return cmdList();
  const first = args[0];
  if (first === "-h" || first === "--help" || first === "-help") {
    console.log(HELP);
    return 0;
  }
  if (first.startsWith("-") && first.length > 1) {
    const flag = first.replace(/^-+/, "");
    const handler = FLAG_HANDLERS[flag];
    if (!handler) {
      console.error(`unknown flag: ${first}\n`);
      console.error(HELP);
      return 2;
    }
    if (args.length > 1) {
      console.error(
        `warning: extra args after ${first} ignored: ${JSON.stringify(args.slice(1))}`
      );
    }
    return handler();
  }
  return cmdPush(args.join(" "));
}

process.exit(main());
