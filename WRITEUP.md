# I built a CRM I run by talking to Claude — and it's just a folder of text files

*A write-up on `claude-crm`: a plain-text, git-versioned CRM with three interchangeable
interfaces — talk to Claude, a tiny CLI + cron, or an optional Obsidian GUI — over the same
folder of markdown files. No database, no SaaS, no dependencies. Draft for
PrestonBezant.me / LinkedIn; edit the voice to taste.*

---

## Long-form (blog)

Every CRM I've tried has the same fatal flaw: it's somewhere else. It's a tab I have to open, a
login I have to remember, a UI I have to click through — and it lives on someone else's server,
in a schema I don't control, that I pay monthly to keep access to. So I'd start strong, log a
few deals, and quietly stop. The friction of *leaving what I was doing to go update the CRM* was
always higher than the value of the update. The pipeline rotted.

So I built the opposite, and it comes down to one decision: **the CRM is a folder of markdown
files, and everything else is just an interface onto that folder.** One client, one file — a YAML
header with the fields I filter on (stage, next action, due date) and a dated timeline of every
touch:

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

That's the whole database. And because the record of truth is just text, I can put **three
different front doors on it** — and use whichever fits the moment:

**1. I talk to Claude.** This is the one that actually keeps it alive. It's a Claude skill, so I
just say what happened: *"Log a call with Northside — they want a quote next week. Move them to
proposal and remind me to follow up Friday."* Claude figures out the client, converts "Friday"
to a date, advances the stage, and writes the record. No form, no fields, no leaving the
conversation I was already in. Updating the CRM costs a sentence.

**2. The CLI and cron.** Under the skill is a ~200-line Node script (`crm.mjs`) with no
dependencies — just the standard library. `crm due` lists everyone I need to follow up with
today; I have it on a weekday-morning cron that drops the list into my daily note, so the
pipeline nudges *me* instead of waiting to be remembered.

**3. Obsidian — but only if I feel like it.** Because the files are markdown with frontmatter,
Obsidian renders them beautifully, with backlinks and Dataview tables ("all clients in
`proposal`, by due date"). But that's a bonus, not a requirement. There is no Obsidian
dependency anywhere. It's a folder of text files; any editor opens it.

Here's why putting it in plain text mattered more than I expected:

**Plain text is the database.** No database to host, migrate, or lose access to. The whole thing
is git-versioned (I can see exactly how a deal evolved), greppable, offline-first, and backed up
with everything else I own. No export button, because it's already in the most portable format
there is. I'll be able to open these files in twenty years.

**One script is the only writer.** Claude, cron, and my own scripts all route writes through
`crm.mjs`, so the format never drifts — every timeline entry and quoted value is produced the
same way. Reading a record by hand is always fine; *writing* goes through the one door. That
discipline is the difference between a system and a pile of notes.

**It logs itself.** `crm.mjs` exposes a `logTouch()` function I import anywhere real work
happens. When my deploy script ships a client's project, the last thing it does is call
`logTouch()` — so "project delivered" lands in that client's timeline and their stage advances
to `won`, automatically, zero data entry. The CRM updates as a *side effect of doing the work*,
which is the only kind of update that reliably happens. (With one guardrail: automated events can
move a client forward but never backward — a re-run can't demote a won deal to "lead.")

**It fails safe.** The detail I'm quietly proud of: if the vault folder isn't found — CI, a fresh
machine, a teammate who cloned the repo without my notes — every command no-ops and exits `0`.
Nothing errors. That's what makes it safe to wire into an automated pipeline: the deploy still
deploys, it just skips logging when there's nothing to log into. A CRM that can crash your deploy
is one you'll rip back out. This one can't.

The whole stack: Node's standard library, plus a skill file. Zero dependencies. Runs anywhere.

**And because the records are just markdown, I can put a face on them.** There's an optional web
dashboard — Todos and a pipeline of glanceable cards, with a drawer for each client's contact, notes,
and full timeline. Two flavors from one template: a static HTML file you open locally (read-only,
offline), or a hosted version behind a login where every edit is a *git commit* back to the records.
So it's still a folder of text files and one small writer — I just added a window I can also edit
through, on my phone, without giving up the plain-text source of truth.

And none of it is specific to my business. I build websites for local businesses, so my pipeline
stages happen to be about demos and deploys — but the stages are one environment variable, and
the pattern (plain text + one small writer + a conversational interface + auto-logging + a safe
no-op + a due sweep) is just *client relationship management*. It'll track consulting leads,
freelance clients, job applications, investor conversations — anything that moves through stages
and needs a nudge.

I pulled it out into a standalone, open-source kit. Install the skill, point it at a folder, and
talk to it:

> "Add Acme Roofing as a lead." → "Log that I called them; quote due next week." →
> "Who's due this week?"

The best tool is the one you'll actually keep using. For me that turned out to be a folder of text
files, a script short enough to read in one sitting, and the ability to update the whole thing by
just saying what happened.

*Code + full setup: https://github.com/pbezant/claude-crm*

---

## Short (LinkedIn)

I built a CRM I run by *talking to Claude*. Under the hood it's just a folder of text files. Here's
why it stuck when every SaaS CRM I tried didn't. 👇

The problem with most CRMs is that they're *somewhere else* — a tab to open, a login to remember,
a UI to click through. So updating the pipeline always loses to whatever I was actually doing. It
rots.

So I inverted it. The CRM is a folder of markdown files, and everything else is just an interface
onto that folder:

🗣️ **I talk to Claude.** "Log a call with Northside, move them to proposal, follow up Friday." It
picks the client, turns "Friday" into a date, advances the stage, writes the record. Updating the
CRM costs one sentence — no form, no context switch.

⌨️ **A ~200-line Node script + cron.** Zero dependencies. One command lists who's due today; a
morning cron drops it into my daily note, so the pipeline nudges me.

📝 **Obsidian, optionally.** The files are markdown, so Obsidian renders them with backlinks and
tables — but it's a bonus, not a requirement. No Obsidian dependency anywhere.

Why plain text won:

• **It's the database.** Git-versioned, greppable, offline, backed up with everything else. No
  vendor, no export button, no schema I don't control. Openable in 20 years.

• **It logs itself.** My deploy script calls a `logTouch()` function on ship — so "delivered"
  records itself and the stage advances. The CRM updates as a side effect of doing the work.

• **It fails safe.** No vault on this machine (CI, a teammate's clone)? Every command no-ops and
  exits clean. A CRM that can't crash your pipeline is one you'll leave wired in.

Total stack: Node's standard library + a skill file. And it's not specific to my business — the
pipeline stages are one env var. Works for consulting leads, freelance clients, job hunts,
fundraising, anything with stages.

The best tool is the one you'll actually keep using. For me that's a folder of text files I can
update by just saying what happened. Open-sourced it — link in comments.

#CRM #Claude #AI #buildinpublic #plaintext #indiehackers
