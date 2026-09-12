/* md-record.mjs — the PURE, dependency-free half of the plain-text-record toolkit.

   These are string-in/string-out primitives for our `key: value` frontmatter + `## Section` markdown
   records: a tiny frontmatter parser/renderer, section append/extract, slug, date, YAML scalar quoting.
   There are NO `node:` imports here, so this module runs unchanged in a Cloudflare Worker (the hosted
   CRM at crm.bezantsolutions.com) as well as in the Node build/CLI tools.

   `md-vault.mjs` re-exports all of these and adds the fs-based vault gates (vaultReady/pathExists) that
   only make sense on a real filesystem. Import from here when you need the parsers without fs. */

const pad2 = (n) => String(n).padStart(2, '0');

// Calendar dates in CRM records should follow the user's/machine's local day, not UTC. Using
// toISOString() here made evening activity in the Americas appear as tomorrow's activity.
export const localDate = (date = new Date()) =>
  `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
export const today = () => localDate();
export function dateAfterDays(days = 0, date = new Date()) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return localDate(result);
}
export const slugify = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

// quote a YAML scalar only when it contains characters that would break a `key: value` line.
export const yamlScalar = (s) => (s === '' || s == null)
  ? ''
  : (/[:#"'\\]/.test(String(s)) ? JSON.stringify(String(s)) : String(s));

// --- tiny frontmatter parser/editor (simple `key: value` scalar blocks only) ---
export function splitDoc(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!m) return { fm: {}, fmOrder: [], body: text, hasFm: false };
  const fm = {}, fmOrder = [];
  for (const line of m[1].split('\n')) {
    const mm = line.match(/^([A-Za-z0-9_]+):\s?(.*)$/);
    if (mm) { fm[mm[1]] = mm[2]; fmOrder.push(mm[1]); }
  }
  return { fm, fmOrder, body: text.slice(m[0].length), hasFm: true };
}
export function renderDoc({ fm, fmOrder, body }) {
  const lines = fmOrder.map(k => `${k}: ${fm[k] ?? ''}`.replace(/\s+$/, ''));
  return `---\n${lines.join('\n')}\n---\n${body}`;
}

// insert a line at the bottom of a `## Heading` section (just before the next heading);
// creates the section at the end of the doc if it doesn't exist yet.
export function appendSection(body, heading, line) {
  const start = body.indexOf(heading);
  if (start === -1) return body.replace(/\s*$/, `\n\n${heading}\n\n${line}\n`);
  const after = body.indexOf('\n## ', start + 1);
  const end = after === -1 ? body.length : after;
  const section = body.slice(start, end).replace(/\s*$/, '');
  return body.slice(0, start) + section + `\n${line}\n` + (after === -1 ? '' : '\n' + body.slice(end + 1));
}

// read the `- ` bullet lines out of a `## Heading` section.
export function extractSection(body, heading) {
  const start = body.indexOf(heading);
  if (start === -1) return [];
  const after = body.indexOf('\n## ', start + 1);
  const end = after === -1 ? body.length : after;
  return body.slice(start + heading.length, end).split('\n').map(s => s.trim()).filter(l => l.startsWith('- '));
}

// read the raw text body of a `## Heading` section (everything between it and the next `## `),
// trimmed. Empty string when the section is absent — for prose sections like `## Draft`.
export function extractSectionRaw(body, heading) {
  const start = body.indexOf(heading);
  if (start === -1) return '';
  const after = body.indexOf('\n## ', start + 1);
  const end = after === -1 ? body.length : after;
  return body.slice(start + heading.length, end).trim();
}

// replace the content of a `## Heading` section with `content`, creating the section (just before
// the next heading, or at the end) if it doesn't exist. Preserves surrounding sections.
export function upsertSection(body, heading, content) {
  const block = `${heading}\n\n${content.trim()}\n`;
  const start = body.indexOf(heading);
  if (start === -1) return body.replace(/\s*$/, `\n\n${block}`);
  const after = body.indexOf('\n## ', start + 1);
  if (after === -1) return body.slice(0, start).replace(/\s*$/, '') + `\n\n${block}`;
  return body.slice(0, start).replace(/\s*$/, '') + `\n\n${block}\n` + body.slice(after + 1);
}
