---
name: claude-crm
description: A plain-text CRM you run by talking to Codex or Claude. Use when the user wants to track a client/lead/deal relationship — logging a touch ("log a call with Acme", "note that I emailed Northside"), moving someone through the pipeline ("move Acme to proposal", "mark that deal won"), scheduling or checking follow-ups ("who do I need to follow up with?", "what's due this week?", "remind me to call them Friday"), adding a new client/lead/prospect, asking the status/history of a client, or capturing a lesson from a lost/stalled deal ("we lost Acme because…", "log why that deal fell through", "what have we learned from lost deals?"). Records are markdown files in a folder (optionally an Obsidian vault); this skill is the conversational interface and crm.mjs is the writer.
---

# claude-crm

A CRM whose records are plain markdown files — one file per client, with a YAML frontmatter
block (stage, next action, due date, contact info), a dated `## Timeline` of every touch, and a
`## Lessons` log of what each lost/stalled deal taught. The user drives it by talking to you. Your
job is to keep those records accurate and current — and to turn losses into lessons.

## The one rule: writes go through `crm.mjs`

`crm.mjs` is the **single writer** for these records — it guarantees consistent formatting
(timeline lines, quoting, stage ranking) and the safe no-op behavior. So:

- **To change a record** (log a touch, advance a stage, reschedule, add contact info): run a
  `crm.mjs` command. Never hand-edit a client file to record a touch — you'll drift the format.
- **To answer a question** (status, history, what's due): you may read the markdown files
  directly, or use `crm.mjs list` / `crm.mjs due`.

## Locate the vault first

Records live in `$CRM_VAULT` (a folder), else `./crm-vault`. Before the first write in a
session, confirm it exists: `node crm.mjs list`. If it errors or is empty and the user is
adding their first client, run `node crm.mjs init` to scaffold it. If `CRM_VAULT` isn't set and
the user has a preferred location (e.g. inside an Obsidian vault), have them export it.

Run commands from the repository root (the folder containing `crm.mjs`). When `CRM_VAULT` is
unset, using an absolute script path from another working directory would select the wrong default
vault because `./crm-vault` is resolved from the working directory.

## The pipeline

Stages, in order (override via `$CRM_STAGES`): `lead → contacted → meeting → proposal → won`.
Terminal (hidden from the follow-up sweep): `won`, `lost`, `dormant`.

Map the user's natural language to a stage — e.g. "they replied / we had a call" → `contacted`,
"met with them" → `meeting`, "sent the quote/proposal" → `proposal`, "signed / closed" → `won`,
"went cold" → `dormant`, "lost it" → `lost`.

## How to handle each kind of request

**Log a touch** ("log a call with Acme; they want a quote next week")
```bash
node crm.mjs log --slug acme --event "call" --note "wants a quote" \
  --stage contacted --next "send quote" --due 2026-10-08
```
- Derive a `--slug` (lowercase, dashes) from the client name; reuse the existing one if the
  client already exists (check `crm.mjs list`).
- Add `--create` only when this is a brand-new client.
- Set `--next` and `--due` whenever the user implies a next step or a timeframe ("next week",
  "in 3 days", "Friday") — convert relative dates to `YYYY-MM-DD`. Today's date is available to you.
- Only set `--stage` when the touch actually moves them; otherwise omit it.

**Add a new client/lead** — same as logging, with `--create` and an intro event:
```bash
node crm.mjs log --slug new-co --event "added as lead" --stage lead --create
```

**Reschedule / add contact info** (no timeline event) → `set`:
```bash
node crm.mjs set --slug acme --due 2026-11-01 --email ops@acme.example --phone 555-0100
```

**Check follow-ups** ("who's due?", "what's due this week?") → `due`:
```bash
node crm.mjs due                 # due today or overdue
node crm.mjs due --within 7      # due within a week
```
Present the result conversationally and offer to reschedule or log the touch they just did.

**Status / history of a client** ("what's going on with Acme?") — read
`$CRM_VAULT/clients/<slug>.md` directly and summarize the frontmatter + timeline.

**Pipeline overview** ("show me my pipeline") → `crm.mjs list`, then group by stage if helpful.

**Log a lesson from a lost/stalled deal** ("we lost Acme — no case study for their trade";
"log why that fell through") → `lesson`:
```bash
node crm.mjs lesson --slug acme \
  --cause "the real reason it was lost — one level deeper than 'they said no'" \
  --countermeasure "the durable fix — an asset to build, an objection answer, a qualifying question" \
  --stage lost      # or dormant; omit if the deal isn't being closed out
```
- Draw out a *real* cause and a *concrete* countermeasure — don't accept "they weren't interested"
  as a root cause; ask what would have changed it. This is the point of the feature.
- Adding `--stage lost`/`--stage dormant` both records the lesson and closes the deal out.

**What have we learned?** ("show me lessons from lost deals", "what's our loss playbook?") →
`node crm.mjs lessons` — every lesson across all clients, grouped by client. Present the
countermeasures as an action list where useful.

## Rules

- **Never fabricate.** Only record what the user actually told you happened. Don't invent
  contact details, dates, or outcomes.
- **Confirm destructive-ish changes.** Advancing to `won`/`lost`, or overwriting existing
  contact info, is worth a one-line confirmation. Routine touch logging doesn't need it.
- **Echo what you did.** After a write, state the slug, the new stage, and the next action/date
  so the user can catch a wrong client or date immediately.
- **Batch sensibly.** If the user recounts several touches at once, make one `crm.mjs log` call
  per client per event, in order.

## Reference

Full commands, cron follow-up sweep, and the importable `logTouch()` / `setFields()` / `logLesson()`
functions (for auto-logging from the user's own scripts) are documented in `README.md`.
