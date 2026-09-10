/* crm-model.mjs — PURE, fs-free record <-> client-object logic, shared by build-dashboard.mjs and the
   optional Cloudflare Worker so both read and edit records identically. No `node:` imports (runs in a
   Worker).

     recordToClient(text, slug) -> the JSON shape the dashboard renders (frontmatter + timeline + notes)
     applyPatch(text, patch)    -> the edited markdown for a { stage, next_action, next_action_date,
                                   email, phone, notes, event, note } patch (mirrors crm.mjs semantics)

   Records are the plain markdown this CRM already uses: `key: value` frontmatter, a `## Timeline` of
   dated touch bullets, and a freeform `## Notes` section. */
import { splitDoc, renderDoc, appendSection, extractSection, extractSectionRaw, upsertSection, today, yamlScalar } from './md-record.mjs';

const clean = (s) => String(s ?? '').replace(/["']/g, '').trim();
const titleCase = (s) => String(s).split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

// Parse a Timeline bullet: "- 2026-09-05 — **discovery** — walked the site" -> {date,event,note}
export function parseTimeline(lines) {
  return lines.map((l) => {
    const parts = l.replace(/^-\s*/, '').split(' — ');
    return { date: (parts[0] || '').trim(), event: (parts[1] || '').replace(/\*\*/g, '').trim(), note: parts.slice(2).join(' — ').trim() };
  }).filter((t) => t.event || t.note);
}

export function recordToClient(text, slugHint) {
  const { fm, body } = splitDoc(text);
  const slug = clean(fm.slug) || slugHint || '';
  return {
    slug,
    name: clean(fm.name) || titleCase(slug),
    stage: clean(fm.stage) || 'lead',
    email: clean(fm.email),
    phone: clean(fm.phone),
    nextAction: clean(fm.next_action),
    nextActionDate: clean(fm.next_action_date),
    created: clean(fm.created),
    timeline: parseTimeline(extractSection(body, '## Timeline')),
    notes: extractSectionRaw(body, '## Notes'),
  };
}

// Apply an edit to a record's markdown. Frontmatter fields set directly; a Timeline line is appended
// when `event` is present; the `## Notes` section is replaced when `notes` is provided. Returns the
// new full document text.
export function applyPatch(text, patch = {}, date = today()) {
  const { fm, fmOrder, body } = splitDoc(text);
  const setFm = (k, v) => { if (v === undefined) return; if (!fmOrder.includes(k)) fmOrder.push(k); fm[k] = yamlScalar(v); };
  setFm('stage', patch.stage);
  setFm('next_action', patch.next_action);
  setFm('next_action_date', patch.next_action_date);
  setFm('email', patch.email);
  setFm('phone', patch.phone);
  let newBody = body;
  if (patch.notes !== undefined) newBody = upsertSection(newBody, '## Notes', patch.notes);
  if (patch.event) {
    const note = patch.note ? ` — ${patch.note}` : '';
    newBody = appendSection(newBody, '## Timeline', `- ${date} — **${patch.event}**${note}`);
  }
  return renderDoc({ fm, fmOrder, body: newBody });
}
