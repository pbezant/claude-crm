#!/usr/bin/env node
/* claude-crm — a plain-text CRM stored as a folder of markdown files. No database, no SaaS,
   no dependencies. One client = one markdown file with YAML frontmatter (stage,
   next_action_date, contact info) and a `## Timeline` of dated touch events.

   Three interchangeable interfaces onto the same files: talk to Claude (see SKILL.md), this
   CLI + cron, or hand-edit in Obsidian / any editor. This script is the ONE place that
   mutates records, so every caller — Claude, a cron follow-up sweep, a hook in your own
   deploy/build/invoice script, or you at the terminal — stays consistent.

   Where the records live:
     $CRM_VAULT, else ./crm-vault (relative to where you run the command).
     Point CRM_VAULT at a folder inside an Obsidian vault to get backlinks/graph as a bonus.

   Fails safe: if the vault folder does not exist (CI, a fresh machine, a teammate without
   the vault), every command NO-OPS and exits 0 — so you can wire `logTouch()` into an
   automated pipeline without ever breaking a headless run.

   Pipeline stages (override with $CRM_STAGES, comma-separated):
     lead → contacted → meeting → proposal → won
   Terminal stages (never surface in the follow-up sweep): won, lost, dormant

   CLI:
     node crm.mjs init                                  # scaffold the vault + client template
     node crm.mjs log  --slug acme --event "call" [--note "..."]
                       [--stage contacted] [--next "send proposal"] [--due 2026-10-01] [--create]
     node crm.mjs set  --slug acme [--stage ...] [--next ...] [--due ...] [--email ...] [--phone ...]
     node crm.mjs due  [--within 0]                     # clients whose next_action_date <= today (+N days)
     node crm.mjs list                                  # every client: slug, stage, due
   Also importable:  import { logTouch, setFields } from './crm.mjs'
*/
import { readFile, writeFile, readdir, mkdir, access } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';

export const VAULT = process.env.CRM_VAULT || path.join(process.cwd(), 'crm-vault');
const CLIENTS = path.join(VAULT, 'clients');
const TEMPLATE = path.join(VAULT, '_templates', 'client.md');

// Pipeline stages, in order. `advanceOnly` callers use this ranking so an automated event
// (e.g. "invoice paid") can move a client forward but never drags one backward.
const STAGES = (process.env.CRM_STAGES || 'lead,contacted,meeting,proposal,won')
  .split(',').map(s => s.trim()).filter(Boolean);
// Stages that count as "closed" — excluded from the follow-up sweep.
const TERMINAL = new Set(['won', 'lost', 'dormant']);

const rank = (s) => { const i = STAGES.indexOf((s || '').replace(/["']/g, '')); return i === -1 ? -1 : i; };
const today = () => new Date().toISOString().slice(0, 10);
const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > -1 ? process.argv[i + 1] : d; };
const hasFlag = (n) => process.argv.includes(`--${n}`);
// Quote a frontmatter value only when it contains YAML-significant characters.
const yesc = (s) => (s === '' || s == null) ? '' : (/[:#"'\\]/.test(String(s)) ? JSON.stringify(String(s)) : String(s));

async function vaultReady() {
  try { await access(VAULT, constants.W_OK); return true; }
  catch { return false; }
}

const DEFAULT_TEMPLATE = `---
type: client
name: NAME
slug: SLUG
stage: lead
email:
phone:
next_action:
next_action_date: YYYY-MM-DD
created: YYYY-MM-DD
---

# NAME

## Timeline

## Notes
`;

// --- tiny frontmatter parser/editor (simple \`key: value\` blocks only) ---
function splitDoc(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!m) return { fm: {}, fmOrder: [], body: text, hasFm: false };
  const fm = {}, fmOrder = [];
  for (const line of m[1].split('\n')) {
    const mm = line.match(/^([A-Za-z0-9_]+):\s?(.*)$/);
    if (mm) { fm[mm[1]] = mm[2]; fmOrder.push(mm[1]); }
  }
  return { fm, fmOrder, body: text.slice(m[0].length), hasFm: true };
}
function renderDoc({ fm, fmOrder, body }) {
  const lines = fmOrder.map(k => `${k}: ${fm[k] ?? ''}`.replace(/\s+$/, ''));
  return `---\n${lines.join('\n')}\n---\n${body}`;
}

// Insert a line at the bottom of the ## Timeline section (just before the next heading).
function appendTimeline(body, line) {
  const start = body.indexOf('## Timeline');
  if (start === -1) return body.replace(/\s*$/, `\n\n## Timeline\n\n${line}\n`);
  const after = body.indexOf('\n## ', start + 1);
  const end = after === -1 ? body.length : after;
  const section = body.slice(start, end).replace(/\s*$/, '');
  return body.slice(0, start) + section + `\n${line}\n` + (after === -1 ? '' : '\n' + body.slice(end + 1));
}

/* Log a touch: append a dated timeline event and (optionally) update pipeline fields.
   Returns { skipped, reason } when the vault is absent so callers can ignore it safely.
   - create:      make the record from the template if it doesn't exist yet.
   - advanceOnly: for automated events — never move the client backward in the pipeline. */
export async function logTouch({ slug, event, note = '', stage, next, due, create = false, advanceOnly = false, date = today() }) {
  if (!await vaultReady()) { return { skipped: true, reason: 'vault-not-found' }; }
  if (!slug || !event) throw new Error('logTouch needs { slug, event }');
  const file = path.join(CLIENTS, `${slug}.md`);
  let text;
  try {
    text = await readFile(file, 'utf8');
  } catch {
    if (!create) return { skipped: true, reason: 'no-record', file };
    const tpl = await readFile(TEMPLATE, 'utf8').catch(() => DEFAULT_TEMPLATE);
    text = tpl.replaceAll('SLUG', slug).replaceAll('NAME', slug).replaceAll('YYYY-MM-DD', date);
  }
  const doc = splitDoc(text);
  const setFm = (k, v) => { if (v !== undefined) { if (!doc.fmOrder.includes(k)) doc.fmOrder.push(k); doc.fm[k] = yesc(v); } };
  // advanceOnly: skip the stage write if it wouldn't move the client forward.
  if (!(advanceOnly && stage !== undefined && rank(stage) <= rank(doc.fm.stage))) setFm('stage', stage);
  setFm('next_action', next);
  setFm('next_action_date', due);
  const noteStr = note ? ` — ${note}` : '';
  doc.body = appendTimeline(doc.body, `- ${date} — **${event}**${noteStr}`);
  await mkdir(CLIENTS, { recursive: true });
  await writeFile(file, renderDoc(doc));
  return { ok: true, file, stage: doc.fm.stage };
}

// Update a record's fields WITHOUT logging a timeline event (rescheduling, adding contact info).
export async function setFields({ slug, stage, next, due, email, phone }) {
  if (!await vaultReady()) return { skipped: true, reason: 'vault-not-found' };
  if (!slug) throw new Error('setFields needs { slug }');
  const file = path.join(CLIENTS, `${slug}.md`);
  const doc = splitDoc(await readFile(file, 'utf8'));
  const setFm = (k, v) => { if (v !== undefined) { if (!doc.fmOrder.includes(k)) doc.fmOrder.push(k); doc.fm[k] = yesc(v); } };
  setFm('stage', stage);
  setFm('next_action', next);
  setFm('next_action_date', due);
  setFm('email', email);
  setFm('phone', phone);
  await writeFile(file, renderDoc(doc));
  return { ok: true, file };
}

async function readClients() {
  const out = [];
  let names = [];
  try { names = await readdir(CLIENTS); } catch { return out; }
  for (const n of names) {
    if (!n.endsWith('.md')) continue;
    const doc = splitDoc(await readFile(path.join(CLIENTS, n), 'utf8'));
    out.push({ slug: n.replace(/\.md$/, ''), fm: doc.fm });
  }
  return out;
}

// Scaffold a fresh vault: clients/ folder + a client template you can edit.
async function cmdInit() {
  await mkdir(CLIENTS, { recursive: true });
  await mkdir(path.dirname(TEMPLATE), { recursive: true });
  try {
    await access(TEMPLATE, constants.F_OK);
    console.log(`• template already exists: ${TEMPLATE}`);
  } catch {
    await writeFile(TEMPLATE, DEFAULT_TEMPLATE);
    console.log(`+ wrote template: ${TEMPLATE}`);
  }
  console.log(`✓ vault ready at ${VAULT}`);
  console.log(`  next: node crm.mjs log --slug acme --event "first call" --stage contacted --next "send proposal" --due ${today()} --create`);
}

async function cmdDue(withinDays = 0, quiet = false) {
  const clients = await readClients();
  const cutoff = new Date(Date.now() + withinDays * 864e5).toISOString().slice(0, 10);
  const strip = s => (s || '').replace(/["']/g, '');
  const due = clients
    .filter(c => c.fm.next_action_date && !TERMINAL.has(strip(c.fm.stage)) && strip(c.fm.next_action_date) <= cutoff)
    .sort((a, b) => a.fm.next_action_date.localeCompare(b.fm.next_action_date));
  // --quiet: print nothing when nothing is due (so a cron '>>' doesn't create empty log lines).
  if (!due.length) { if (!quiet) console.log(`No follow-ups due (through ${cutoff}).`); return; }
  console.log(`Follow-ups due through ${cutoff}:\n`);
  for (const c of due) {
    console.log(`• ${strip(c.fm.name) || c.slug}  [${strip(c.fm.stage)}]  due ${c.fm.next_action_date}`);
    console.log(`    → ${strip(c.fm.next_action) || '(no action set)'}`);
  }
}

async function cmdList() {
  const clients = await readClients();
  const strip = s => (s || '').replace(/^"|"$/g, '');
  for (const c of clients.sort((a, b) => a.slug.localeCompare(b.slug))) {
    console.log(`${c.slug.padEnd(42)} ${strip(c.fm.stage).padEnd(11)} due ${c.fm.next_action_date || '—'}`);
  }
}

// --- CLI ---
const invokedDirectly = import.meta.url === `file://${process.argv[1]}`;
if (invokedDirectly) {
  const cmd = process.argv[2];
  if (cmd === 'init') {
    await cmdInit();
  } else if (!await vaultReady() && cmd !== 'due' && cmd !== 'list') {
    console.log(`(CRM vault not found at ${VAULT} — run: node crm.mjs init)`); process.exit(0);
  } else if (cmd === 'log') {
    const r = await logTouch({
      slug: arg('slug'), event: arg('event'), note: arg('note', ''),
      stage: arg('stage'), next: arg('next'), due: arg('due'), create: hasFlag('create'),
    });
    if (r.ok) console.log(`✓ logged "${arg('event')}" → ${arg('slug')} (stage: ${(r.stage || '').replace(/^"|"$/g, '')})`);
    else console.log(`(crm log skipped: ${r.reason})`);
  } else if (cmd === 'set') {
    const r = await setFields({
      slug: arg('slug'), stage: arg('stage'), next: arg('next'),
      due: arg('due'), email: arg('email'), phone: arg('phone'),
    });
    console.log(r.ok ? `✓ updated ${arg('slug')}` : `(crm set skipped: ${r.reason})`);
  } else if (cmd === 'due') {
    await cmdDue(parseInt(arg('within', '0'), 10) || 0, hasFlag('quiet'));
  } else if (cmd === 'list') {
    await cmdList();
  } else {
    console.log('usage: node crm.mjs <init|log|set|due|list> [flags] (see header)');
    process.exit(1);
  }
}
