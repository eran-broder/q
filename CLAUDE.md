# Follow-up queue (`q` CLI)

The user maintains a follow-up queue via the `q` CLI. **Scope is session-bound when invoked from within a Claude Code session**: the queue file is `~/.claude/q/sessions/<CLAUDE_CODE_SESSION_ID>.json`. From a plain terminal (no env var), it falls back to cwd-relative `.claude/followups.json`.

This means: when you (Claude) run `q -peek` / `q -pop` inside a session, you and the user are looking at the *same* session-scoped queue. Items queued in session A are invisible from session B — that's intentional. `q -where` shows the resolved path.

The user pushes items **silently** — either from a separate terminal or via the `!` prefix in the Claude prompt (e.g., `! q fix the auth bug`). These pushes bypass the model. **You will not see them happen.** Do not assume the queue is empty just because you haven't been told about items.

A Stop hook also runs at every turn-end and wakes you with a system-reminder *only when the queue has grown since the last check*. If you wake from such a reminder, the user has just pushed something silently.

## CLI surface

| Command          | Effect                                                |
| ---------------- | ----------------------------------------------------- |
| `q <text...>`    | Push text onto the queue                              |
| `q` / `q -list`  | List all items, oldest first                          |
| `q -peek`        | Show next item without removing                       |
| `q -count`       | Print integer queue length                            |
| `q -clear`       | Empty the queue                                       |
| `q -pop`         | Remove and return the oldest item (machine-parseable) |
| `q -where`       | Show resolved queue file path and scope               |

The script source is at `~/.claude/q/queue.js` (Node, stdlib only).

## When to peek (proactive offer)

After you have just summarized completed work and the user signals satisfaction — "done", "ship it", "perfect", "looks good", "great, thanks", "nice" — run:

```
q -peek
```

- If the output is `Queue is empty.`, **stay silent**. Do not mention the queue.
- If the output is `Next: <text>  (N in queue)`, offer the item (do **not** auto-start):

  > Queue has N items. Next: "<text>". Start it?

**Suppress the offer when:**
- The user asked a follow-up question about the just-completed work.
- Their acceptance was ambiguous ("hm", "ok let me think", "maybe").
- You already offered this turn and were declined.

## When to pop (dequeue and begin work)

On user accept ("yes", "go", "start it"), or explicit "do the next one" / "what's next, start it" / "start next", run:

```
q -pop
```

The script prints two lines:
- Line 1: `Starting: <text>  (N left in queue)` — emit this verbatim as your first output line, before any other text.
- Line 2: `::TEXT::<text>` — parse-only. `<text>` is the user's effective new request. Begin work after the announcement.

If `-pop` returns `Queue is empty.` (exit 1), say so and stop.

**Never pop without consent.** Pop only on explicit accept of an offer, or an explicit "start next"-style request from the user.

## When you wake from the Stop hook reminder

The hook fires when the queue *grew* during your previous turn (the user pushed items silently while you worked). When you wake from such a reminder:

- If the conversation context makes the next-item intent obvious (e.g., the user is clearly handing off a sequence of tasks), pop and start.
- If it's ambiguous (e.g., the user might still be present and want to dictate priority), offer first.
- Either way, *acknowledge the new items* briefly. Don't pretend you didn't see them.
