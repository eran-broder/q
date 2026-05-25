# q — silent follow-up queue for Claude Code

A tiny CLI that lets you queue follow-up tasks for Claude **without interrupting it**. Push items from your shell; Claude picks them up between turns. Per-session, no plugins, no skills, no slash commands — just `q` on your PATH plus a Stop hook that wakes Claude when new items arrive.

## What it does

```bash
# While Claude is working on the current task, queue follow-ups from any terminal:
$ q "fix the auth bug after this"
Queued: fix the auth bug after this  (1 in queue)

$ q "also bump tailwind to v4"
Queued: also bump tailwind to v4  (2 in queue)

# Inside the Claude prompt, ! runs in shell — same effect:
> ! q "check what changed in package.json"
```

Claude doesn't see the pushes. When it finishes a turn and the queue has *grown* during its work, a Stop hook wakes it with a system-reminder so it can offer or start the next item — no prompt from you required.

## Surface

| Command            | Effect                                                |
| ------------------ | ----------------------------------------------------- |
| `q <text...>`      | Push text onto the queue                              |
| `q` or `q -list`   | List all items, oldest first                          |
| `q -peek`          | Show next item without removing                       |
| `q -count`         | Print integer queue length                            |
| `q -clear`         | Empty the queue                                       |
| `q -pop`           | Remove and return the oldest item (used by Claude)    |
| `q -where`         | Show resolved queue file path and scope               |
| `q -h, --help`     | Show help                                             |

## Scoping

Inside a Claude Code session, the queue is **per-session** — it's keyed by `$CLAUDE_CODE_SESSION_ID` and lives at `~/.claude/q/sessions/<id>.json`. Items pushed in one session are invisible from another. (`claude --resume <id>` does pick them back up — the session ID is the key.)

Outside Claude Code (plain terminal), the queue is **cwd-scoped** at `.claude/followups.json` in the current directory.

## Install

Requirements: **Node.js 14+** and **Claude Code**. Nothing else.

```bash
git clone https://github.com/<your-user>/q
cd q
./install.sh       # POSIX: macOS, Linux, WSL
# or
.\install.ps1      # Windows PowerShell
```

Or in one shot:

```bash
curl -fsSL https://raw.githubusercontent.com/<your-user>/q/main/install.sh | bash
```

The installer:

1. Copies `queue.js`, `hook-stop.js`, and `CLAUDE.md` to `~/.claude/q/`.
2. Drops `q` (bash) and `q.cmd` (Windows) shims into `~/.local/bin/`.
3. Appends a single `@~/.claude/q/CLAUDE.md` import line to `~/.claude/CLAUDE.md` so Claude sees the awareness fragment in every session.
4. Adds a Stop hook (with `asyncRewake: true`) to `~/.claude/settings.json` that wakes Claude when the queue grows.

All steps are idempotent — re-run to upgrade. **Restart any active Claude Code session** for the Stop hook to take effect.

If `~/.local/bin` isn't on your PATH, the installer prints the line you need to add to your shell config.

### Uninstall

```bash
./uninstall.sh                  # POSIX
.\uninstall.ps1                 # Windows
./uninstall.sh --keep-sessions  # keep ~/.claude/q/sessions/ as a backup
```

## Design notes

- **Why a CLI, not a Claude Code skill?** A skill invocation wakes the model — the whole point of `q` is to push tasks *without* interrupting. The CLI is silent; Claude only learns about pushes via the Stop hook (which fires at turn-end, not on push).
- **Why a Stop hook with `asyncRewake`?** When you queue items during a long Claude task and then walk away, you want Claude to pick them up automatically when the current task finishes — not wait for you to come back and prompt. The Stop hook detects queue *growth* between turn-ends and wakes Claude with a system-reminder.
- **Why growth-based, not just non-empty?** If the hook woke Claude whenever the queue had items, you'd loop: Claude wakes, offers "want me to start the next?", turn ends, queue still has items, hook wakes again, etc. Tracking growth means the wake fires exactly once per "the user added more stuff" event.
- **Why per-session scoping by default?** Two concurrent Claude sessions in the same repo would otherwise clobber each other's queues. The session ID is a free unique key; ignoring it would create cross-talk.
- **Zero dependencies.** `queue.js` and `hook-stop.js` use only `node:fs`, `node:path`, `node:os`. Auditable in ~150 lines each.

## Test

```bash
node test/queue.test.js
```

Runs a smoke test in an isolated temp `$HOME` covering push, list, peek, pop, clear, session scoping, the cwd fallback, growth detection, and the recursion-avoidance flat-count case.

## File layout (after install)

```
~/.claude/
├── CLAUDE.md                       # has @~/.claude/q/CLAUDE.md (one line)
├── settings.json                   # has the Stop hook entry
└── q/
    ├── queue.js                    # the CLI
    ├── hook-stop.js                # Stop-hook companion
    ├── CLAUDE.md                   # awareness fragment
    └── sessions/
        ├── <session-id>.json       # queue file, per session
        └── <session-id>.lastcount  # growth-detector state, per session

~/.local/bin/
├── q                               # bash shim
└── q.cmd                           # Windows shim (created on Windows)
```

## License

MIT. See [LICENSE](./LICENSE).
