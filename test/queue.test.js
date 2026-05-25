#!/usr/bin/env node
// Smoke tests for queue.js and hook-stop.js — stdlib only, no test framework.
// Runs each scenario in an isolated temp HOME so it doesn't touch the user's
// real queue.

"use strict";
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { spawnSync } = require("node:child_process");

const REPO = path.resolve(__dirname, "..");
const QUEUE = path.join(REPO, "queue.js");
const HOOK = path.join(REPO, "hook-stop.js");

let passed = 0;
let failed = 0;

function makeSandbox() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "q-test-"));
  const env = {
    ...process.env,
    HOME: home,
    USERPROFILE: home,
    CLAUDE_CODE_SESSION_ID: "test-session-uuid",
  };
  return { home, env };
}

function runQ(env, args, cwd) {
  return spawnSync(process.execPath, [QUEUE, ...args], {
    env,
    cwd: cwd || env.HOME,
    encoding: "utf8",
  });
}

function runHook(env, cwd) {
  return spawnSync(process.execPath, [HOOK], {
    env,
    cwd: cwd || env.HOME,
    encoding: "utf8",
  });
}

function eq(actual, expected, label) {
  if (actual === expected) {
    passed++;
    process.stdout.write(`  ✓ ${label}\n`);
  } else {
    failed++;
    process.stdout.write(
      `  ✗ ${label}\n    expected: ${JSON.stringify(expected)}\n    actual:   ${JSON.stringify(actual)}\n`
    );
  }
}

function contains(actual, needle, label) {
  if (actual.includes(needle)) {
    passed++;
    process.stdout.write(`  ✓ ${label}\n`);
  } else {
    failed++;
    process.stdout.write(
      `  ✗ ${label}\n    expected substring: ${JSON.stringify(needle)}\n    actual: ${JSON.stringify(actual)}\n`
    );
  }
}

// ---------------------------------------------------------------------------

process.stdout.write("\nqueue.js — basic operations\n");
{
  const { env } = makeSandbox();

  let r = runQ(env, []);
  eq(r.status, 0, "bare q on empty queue exits 0");
  contains(r.stdout, "Queue is empty.", "bare q says empty");

  r = runQ(env, ["-peek"]);
  eq(r.status, 1, "-peek on empty exits 1");

  r = runQ(env, ["-count"]);
  eq(r.stdout.trim(), "0", "-count on empty prints 0");

  r = runQ(env, ["fix", "the", "auth", "bug"]);
  eq(r.status, 0, "push multi-arg exits 0");
  contains(r.stdout, "Queued: fix the auth bug", "push joins args with spaces");
  contains(r.stdout, "(1 in queue)", "push reports new count");

  r = runQ(env, ["another task"]);
  contains(r.stdout, "(2 in queue)", "second push reports 2");

  r = runQ(env, ["-list"]);
  contains(r.stdout, "1. fix the auth bug", "list shows first item with index");
  contains(r.stdout, "2. another task", "list shows second item");

  r = runQ(env, ["-peek"]);
  eq(r.status, 0, "-peek on non-empty exits 0");
  contains(r.stdout, "Next: fix the auth bug", "-peek shows oldest");

  r = runQ(env, ["-pop"]);
  eq(r.status, 0, "-pop exits 0");
  contains(r.stdout, "Starting: fix the auth bug", "-pop announces oldest");
  contains(r.stdout, "::TEXT::fix the auth bug", "-pop emits machine line");
  contains(r.stdout, "(1 left in queue)", "-pop reports remaining count");

  r = runQ(env, ["-count"]);
  eq(r.stdout.trim(), "1", "count is 1 after pop");

  r = runQ(env, ["-clear"]);
  contains(r.stdout, "Queue cleared.", "-clear works");

  r = runQ(env, ["-count"]);
  eq(r.stdout.trim(), "0", "count is 0 after clear");
}

// ---------------------------------------------------------------------------

process.stdout.write("\nqueue.js — session scoping\n");
{
  const { home, env } = makeSandbox();
  runQ(env, ["session task"]);
  const sessionFile = path.join(
    home,
    ".claude",
    "q",
    "sessions",
    "test-session-uuid.json"
  );
  eq(fs.existsSync(sessionFile), true, "session-scoped file is created");

  // No env var -> cwd fallback
  const noSidEnv = { ...env };
  delete noSidEnv.CLAUDE_CODE_SESSION_ID;
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "q-cwd-"));
  runQ(noSidEnv, ["cwd task"], cwd);
  const cwdFile = path.join(cwd, ".claude", "followups.json");
  eq(fs.existsSync(cwdFile), true, "cwd-scoped file is created when env unset");
}

// ---------------------------------------------------------------------------

process.stdout.write("\nhook-stop.js — growth detection\n");
{
  const { env } = makeSandbox();

  let r = runHook(env);
  eq(r.status, 0, "empty queue: hook exits 0");
  eq(r.stdout, "", "empty queue: hook is silent");

  runQ(env, ["first"]);
  r = runHook(env);
  eq(r.status, 2, "growth 0→1: hook exits 2 (wake)");
  contains(r.stdout, "grew by 1 item", "wake message reports growth");
  contains(r.stdout, 'Next: "first"', "wake message names next item");

  r = runHook(env);
  eq(r.status, 0, "no growth (1→1): hook exits 0");
  eq(r.stdout, "", "no growth: hook is silent");

  runQ(env, ["second"]);
  runQ(env, ["third"]);
  r = runHook(env);
  eq(r.status, 2, "growth 1→3: hook exits 2");
  contains(r.stdout, "grew by 2 item", "wake message reports correct delta");

  runQ(env, ["-pop"]);
  r = runHook(env);
  eq(r.status, 0, "shrink 3→2: hook exits 0");

  runQ(env, ["fourth"]);
  r = runHook(env);
  eq(r.status, 2, "growth 2→3: hook exits 2 again");
}

// ---------------------------------------------------------------------------

process.stdout.write("\nqueue.js — error & edge cases\n");
{
  const { env } = makeSandbox();

  let r = runQ(env, ["-bogus"]);
  eq(r.status, 2, "unknown flag exits 2");
  contains(r.stderr, "unknown flag", "unknown flag prints error");

  r = runQ(env, ["-help"]);
  eq(r.status, 0, "-help exits 0");
  contains(r.stdout, "Usage:", "-help shows usage");
}

// ---------------------------------------------------------------------------

process.stdout.write(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
