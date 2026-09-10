/* crm-worker — an OPTIONAL hosted, editable web front end for this CRM.

   Serves the dashboard and a small API over your client records, which must live as markdown in a git
   repo the Worker can reach (typically a PRIVATE repo — client data). Reads and writes go through the
   GitHub Contents API, so every edit is a real commit: the plain-text, git-versioned CRM stays the
   source of truth, and your local tools (crm.mjs, Obsidian) see cloud edits after a `git pull`.

   Auth: put Cloudflare Access in front of the hostname. This Worker also refuses any request without an
   Access assertion header (defense in depth), unless REQUIRE_ACCESS is "false" (local `wrangler dev`).

   Config (wrangler.jsonc vars + one secret):
     secret GITHUB_TOKEN   fine-grained PAT, contents:read/write on the records repo (never sent to the browser)
     var    GH_OWNER       GitHub owner/org that holds your records repo
     var    GH_REPO        the records repo name
     var    GH_BRANCH      branch to read/commit (e.g. "main")
     var    CRM_DIR        path to the records dir in that repo (e.g. "crm-vault/clients")
     var    REQUIRE_ACCESS "true" (default) — set "false" only for local dev without Access
*/
import { dashboardHTML } from '../dashboard-template.mjs';
import { recordToClient, applyPatch } from '../crm-model.mjs';

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };

function toBase64(str) { const b = new TextEncoder().encode(str); let s = ''; for (const x of b) s += String.fromCharCode(x); return btoa(s); }
function fromBase64(b64) { const bin = atob(b64.replace(/\n/g, '')); return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0))); }

function gh(env, apiPath, init = {}) {
  return fetch(`https://api.github.com${apiPath}`, {
    ...init,
    headers: { authorization: `Bearer ${env.GITHUB_TOKEN}`, accept: 'application/vnd.github+json', 'user-agent': 'claude-crm-worker', ...(init.headers || {}) },
  });
}

async function listRecords(env) {
  const dir = env.CRM_DIR || 'crm-vault/clients';
  const res = await gh(env, `/repos/${env.GH_OWNER}/${env.GH_REPO}/contents/${dir}?ref=${env.GH_BRANCH}`);
  if (!res.ok) throw new Error(`GitHub list ${res.status}`);
  const entries = (await res.json()).filter((e) => e.type === 'file' && e.name.endsWith('.md'));
  const clients = await Promise.all(entries.map(async (e) => {
    const r = await gh(env, `/repos/${env.GH_OWNER}/${env.GH_REPO}/contents/${e.path}?ref=${env.GH_BRANCH}`, { headers: { accept: 'application/vnd.github.raw' } });
    return recordToClient(await r.text(), e.name.replace(/\.md$/, ''));
  }));
  clients.sort((a, b) => a.name.localeCompare(b.name));
  return clients;
}

async function getFile(env, p) {
  const res = await gh(env, `/repos/${env.GH_OWNER}/${env.GH_REPO}/contents/${p}?ref=${env.GH_BRANCH}`);
  if (!res.ok) return null;
  const j = await res.json();
  return { text: fromBase64(j.content), sha: j.sha };
}
async function putFile(env, p, text, sha, message) {
  const res = await gh(env, `/repos/${env.GH_OWNER}/${env.GH_REPO}/contents/${p}`, { method: 'PUT', body: JSON.stringify({ message, content: toBase64(text), sha, branch: env.GH_BRANCH }) });
  if (!res.ok) throw new Error(`GitHub write ${res.status}: ${await res.text()}`);
  return res.json();
}

function accessOk(request, env) {
  if (String(env.REQUIRE_ACCESS ?? 'true') === 'false') return true;
  return !!request.headers.get('Cf-Access-Jwt-Assertion');
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/robots.txt') return new Response('User-agent: *\nDisallow: /\n', { headers: { 'content-type': 'text/plain' } });
    if (!accessOk(request, env)) return new Response('Forbidden — this app is behind Cloudflare Access.', { status: 403 });

    if (url.pathname === '/' && request.method === 'GET') {
      return new Response(dashboardHTML({ editable: true, title: 'CRM' }), { headers: { 'content-type': 'text/html; charset=utf-8', 'x-robots-tag': 'noindex, nofollow', 'cache-control': 'no-store' } });
    }
    if (url.pathname === '/api/clients' && request.method === 'GET') {
      try { return new Response(JSON.stringify(await listRecords(env)), { headers: JSON_HEADERS }); }
      catch (e) { return new Response(JSON.stringify({ error: String(e.message || e) }), { status: 502, headers: JSON_HEADERS }); }
    }
    const m = url.pathname.match(/^\/api\/clients\/([a-z0-9-]+)$/);
    if (m && request.method === 'POST') {
      const slug = m[1];
      const p = `${env.CRM_DIR || 'crm-vault/clients'}/${slug}.md`;
      try {
        const patch = await request.json();
        const file = await getFile(env, p);
        if (!file) return new Response(JSON.stringify({ error: 'no such client' }), { status: 404, headers: JSON_HEADERS });
        const next = applyPatch(file.text, patch);
        if (next !== file.text) await putFile(env, p, next, file.sha, `crm(${slug}): ${patch.event || 'update'} (via dashboard)`);
        return new Response(JSON.stringify(recordToClient(next, slug)), { headers: JSON_HEADERS });
      } catch (e) { return new Response(JSON.stringify({ error: String(e.message || e) }), { status: 502, headers: JSON_HEADERS }); }
    }
    return new Response('Not found.', { status: 404 });
  },
};
