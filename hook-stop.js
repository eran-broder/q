#!/usr/bin/env node
// Stop-hook companion for the q queue.
//
// Wake Claude (exit 2 with asyncRewake: true) ONLY when the queue has grown
// since the last check. Avoids the recursion trap: if Claude wakes, offers
// an item but doesn't pop, the queue count stays flat — next Stop fire sees
// no growth, no wake.
//
// Empty queue or shrink/flat queue: exit 0 silent (no model interaction).
//
// State: ~/.claude/q/sessions/<sid>.lastcount  (single integer, updated each fire)
//
// SAFETY: this script never emits JSON with `decision` or `continue:false`.
// The only way it touches the model is exit-2-with-stdout when asyncRewake
// is set on the hook command. Without growth, it's purely silent.
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const sid = process.env.CLAUDE_CODE_SESSION_ID;
const queueFile = sid
  ? path.join(os.homedir(), ".claude", "q", "sessions", `${sid}.json`)
  : path.join(".claude", "followups.json");
const stateFile = queueFile.replace(/\.json$/, ".lastcount");

let items = [];
if (fs.existsSync(queueFile)) {
  try {
    const parsed = JSON.parse(fs.readFileSync(queueFile, "utf8"));
    if (Array.isArray(parsed)) items = parsed;
  } catch {
    /* corrupted; treat as empty */
  }
}
const currentCount = items.length;

let lastCount = 0;
if (fs.existsSync(stateFile)) {
  const v = parseInt(fs.readFileSync(stateFile, "utf8").trim(), 10);
  if (Number.isFinite(v) && v >= 0) lastCount = v;
}

// Always update the marker so the next Stop fire compares against what WE just saw.
fs.mkdirSync(path.dirname(stateFile), { recursive: true });
fs.writeFileSync(stateFile, String(currentCount));

if (currentCount === 0) process.exit(0);
if (currentCount <= lastCount) process.exit(0);

// Growth → wake the model with a plain-text reminder.
const grew = currentCount - lastCount;
const next = items[0].text;
process.stdout.write(
  `The q follow-up queue grew by ${grew} item(s) while you were working ` +
  `(now ${currentCount} pending). Next: "${next}". The user pushed these silently ` +
  `via the q CLI; they likely want you to start handling them now. ` +
  `Run \`q -pop\` to begin the next item, or briefly acknowledge and offer if context suggests asking first.`
);
process.exit(2);
