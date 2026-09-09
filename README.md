# claude-crm

A plain-text CRM you can **run by talking to Claude** — stored as a plain folder of markdown
files — **that also learns from your lost deals.** **No database, no SaaS, no dependencies.** One
client is one markdown file with a YAML frontmatter block, a dated `## Timeline`, and a `## Lessons`
log of what each loss taught you. A single Node script (`crm.mjs`) is the only thing that ever
writes to those files, so every way you interact with it stays in sync.

**Three interfaces, one folder of files** — use any or all:

| Interface | For | How |
|---|---|---|
| 🗣️ **Claude** (primary) | Everyday logging, hands-free | "Log a call with Acme, move them to proposal, follow up Friday." The `claude-crm` skill (`SKILL.md`) drives `crm.mjs` for you. |
| ⌨️ **CLI + cron** | Automation, scripts, a daily due sweep | `node crm.mjs log/due/list …` and `logTouch()` imported into your own scripts. |
| 📝 **Obsidian / any editor** (optional) | Reading, backlinks, Dataview tables | Point `CRM_VAULT` at a folder inside your vault. Purely optional — the CRM needs no GUI. |

```
crm-vault/
├── _templates/
│   └── client.md            # the shape every new record is stamped from
└── clients/
    ├── northside-dental.md  # one file per client
    ├── acme-roofing.md
    └── …
```

Each `clients/<slug>.md`:

```markdown
---
type: client
name: Northside Dental
stage: proposal
next_action: follow up on the proposal
next_action_date: 2026-10-01
---

# Northside Dental

## Timeline
- 2026-09-02 — **intro call** — wants a new booking flow before Q1
- 2026-09-12 — **proposal sent** — 3-tier scope

## Notes
Decision-maker is Dr. Okafor; office manager gatekeeps scheduling.
```

Because it's just text: git-versioned, greppable, searchable, offline-first, backs up with
everything else, and yours forever in a format nothing can take away.

---

## Why this exists

Most CRMs are a database you rent, wrapped in a UI you don't control, that you have to leave
your work to update — so you don't. This one inverts all three: the record of truth is a folder
of markdown files, and updating it is either one sentence to Claude or one command — no context
switch. The pipeline lives where your work already is.

Four load-bearing ideas:

1. **Plain text is the database.** Nothing to host, migrate, or lose access to.
2. **One writer.** `crm.mjs` is the *only* code that mutates records, so Claude, cron, and your
   scripts never format things differently. (Reading a record by hand is fine anytime.)
3. **It auto-logs.** Import `logTouch()` into your own scripts so real work (a deploy, an
   invoice paid, an email sent) records itself — the CRM stays current without data entry.
4. **It fails safe.** If the vault folder isn't found (CI, a fresh machine, a teammate without
   it), every command no-ops and exits `0` — safe to wire into an automated pipeline.

> **Is Obsidian required?** No. Storage is just a folder of `.md` files. Obsidian is an optional
> GUI that happens to render the frontmatter and give you backlinks/graph/Dataview. The CRM
> works identically with no Obsidian installed.

---

## Install the Claude skill (primary interface)

Requires **Node 18+**. No `npm install` — `crm.mjs` uses only Node built-ins.

```bash
git clone https://github.com/pbezant/claude-crm.git
# Make it a Claude Code skill (user-level; or copy into a project's .claude/skills/):
ln -s "$(pwd)/claude-crm" ~/.claude/skills/claude-crm

# Tell it where records should live (a plain folder, optionally inside an Obsidian vault):
export CRM_VAULT="$HOME/Documents/Obsidian/MyVault/CRM"   # add to ~/.zshrc / ~/.bashrc
```

Then just talk to Claude:

> "Add Acme Roofing as a new lead." · "Log that I called Northside — they want a quote next
> week." · "Move Acme to proposal and follow up Friday." · "Who do I need to follow up with?"

Claude reads/answers from the files and routes every change through `crm.mjs`. See `SKILL.md`
for exactly how it behaves.

*(No Claude Code? The CLI below is a complete, standalone way to use it.)*

---

## Use the CLI directly

```bash
node crm.mjs init                 # scaffold the vault (clients/ + a template)
node crm.mjs log --slug acme-roofing --event "intro call" \
  --stage contacted --next "send proposal" --due 2026-10-01 --create
node crm.mjs list                 # the whole pipeline
node crm.mjs due                  # what needs action today
```

| Command | What it does |
|---|---|
| `init` | Scaffold the vault: `clients/` + a client template. |
| `log --slug S --event "…"` | Append a dated timeline event. Flags below. |
| `set --slug S …` | Update fields **without** a timeline event (reschedule, add contact info). |
| `lesson --slug S …` | Record why a deal was lost/stalled + the countermeasure (see below). |
| `lessons` | The playbook: every lesson across all clients. |
| `due [--within N]` | Clients whose `next_action_date` is today (or within N days). |
| `list` | Every client: slug, stage, due date. |

**`log` flags:** `--event` (required), `--note`, `--stage`, `--next`, `--due YYYY-MM-DD`,
`--create`, `--quiet` (for `due`: print nothing when nothing is due).
**`set` flags:** `--stage`, `--next`, `--due`, `--email`, `--phone`.
**`lesson` flags:** `--cause` (required), `--countermeasure`/`--cm` (required), `--stage`, `--note`.

---

## The pipeline

Default stages, in order: `lead → contacted → meeting → proposal → won`.
Plus three **terminal** stages hidden from the follow-up sweep: `won`, `lost`, `dormant`.

Change them to fit your business — no code edits:

```bash
export CRM_STAGES="lead,qualified,demo,negotiation,signed"
```

Stages are **ranked**, which powers `advanceOnly`: an automated event can move a client forward
but is prevented from ever dragging one backward.

---

## Learn from lost deals

A pipeline tells you *who* to chase. It should also make you *better* at chasing. When a deal is
lost or goes cold, capture **why** and the **countermeasure** — the durable change that makes the
next pitch better (an asset to build, an objection answer, a qualifying question to add):

```bash
node crm.mjs lesson --slug acme-roofing \
  --cause "no case study in their trade — couldn't answer 'have you done my industry?'" \
  --countermeasure "build a roofing case study from the best existing demo" \
  --stage lost
```

The lesson lands inline in that client's `## Lessons` section (the record stays the source of
truth — no separate file), with a `## Timeline` marker so the history is complete. Then read the
whole **playbook** — every lesson across every client — in one place:

```bash
node crm.mjs lessons
```

Because lessons live in the records themselves, they're greppable, backlinkable, and Dataview-able
in Obsidian like everything else. Same discipline a good ops team runs on failures — every loss
becomes a permanent countermeasure — applied to your pipeline.

---

## Auto-logging from your own scripts

Where it stops being a manual tracker and starts staying current on its own. Import `logTouch()`
and drop it wherever real work happens — a deploy script, an invoice webhook, a "send email" helper:

```js
import { logTouch } from './crm.mjs';

await logTouch({
  slug: 'acme-roofing',
  event: 'project delivered',
  note: 'live at https://acme.example',
  stage: 'won',
  create: true,        // make the record if it doesn't exist yet
  advanceOnly: true,   // never move this client backward in the pipeline
});
```

Returns `{ skipped: true, reason: 'vault-not-found' }` instead of throwing when the vault is
absent — so the same script runs fine in CI. `setFields()` is the silent counterpart (update
fields, no timeline event).

---

## A daily follow-up sweep (cron)

`--quiet` prints nothing when the list is empty, so an empty day doesn't spam your log:

```cron
# 8am weekdays: append due follow-ups to a daily log
0 8 * * 1-5  CRM_VAULT="$HOME/Documents/Obsidian/MyVault/CRM" /usr/local/bin/node /path/to/crm.mjs due --quiet >> "$HOME/crm-due.log" 2>&1
```

Or pipe it into a notification, a Slack webhook, or your Obsidian daily note.

---

## Files in this repo

| File | Role |
|---|---|
| `SKILL.md` | The Claude skill — how Claude drives the CRM from natural language. |
| `crm.mjs` | The whole engine — CLI + importable `logTouch()` / `setFields()` / `logLesson()`. |
| `_templates/client.md` | Reference copy of the record template `init` writes. |
| `examples/northside-dental.md` | A populated record, so you can see the shape. |
| `package.json` | Marks it as an ES module; `npm run init/due/list/lessons` shortcuts. |
| `WRITEUP.md` | The story/design behind it (blog + LinkedIn drafts). |

MIT licensed. Built by [Preston Bezant](https://prestonbezant.me).
