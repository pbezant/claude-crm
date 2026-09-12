/* build-dashboard.mjs — generate a static, read-only dashboard from the CRM records.

   Reads every client markdown file in the vault (CRM_VAULT/clients, default ./crm-vault/clients) and
   writes a single self-contained ./out/dashboard.html: Todos (next action due today/overdue) and
   Pipeline (big cards grouped by stage), with a per-client drawer showing contact, notes, and the full
   timeline. Opens as a plain file, works offline. For an EDITABLE, hosted version see crm-worker/.

   Run:  node build-dashboard.mjs        (or: npm run dashboard)
*/
import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
import { constants } from 'node:fs';
import { access } from 'node:fs/promises';
import path from 'node:path';

import { recordToClient } from './crm-model.mjs';
import { dashboardHTML } from './dashboard-template.mjs';
import { today } from './md-record.mjs';

const VAULT = process.env.CRM_VAULT || path.join(process.cwd(), 'crm-vault');
const CLIENTS = path.join(VAULT, 'clients');
const OUT = path.join(process.cwd(), 'out', 'dashboard.html');
const exists = async (p) => { try { await access(p, constants.F_OK); return true; } catch { return false; } };

async function loadClients() {
  if (!await exists(CLIENTS)) {
    console.log(`No clients dir at ${CLIENTS} — nothing to build. (Set CRM_VAULT or run \`node crm.mjs init\`.)`);
    return null;
  }
  const files = (await readdir(CLIENTS)).filter((f) => f.endsWith('.md'));
  const clients = [];
  for (const f of files) clients.push(recordToClient(await readFile(path.join(CLIENTS, f), 'utf8'), f.replace(/\.md$/, '')));
  clients.sort((a, b) => a.name.localeCompare(b.name));
  return clients;
}

const clients = await loadClients();
if (clients) {
  await mkdir(path.dirname(OUT), { recursive: true });
  await writeFile(OUT, dashboardHTML({ clientsJson: JSON.stringify(clients), editable: false }));
  const localToday = today();
  const due = clients.filter((c) => c.nextActionDate && c.nextActionDate <= localToday).length;
  console.log(`Wrote ${OUT} — ${clients.length} clients, ${due} due. Open it in a browser.`);
}
