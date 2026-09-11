/* dashboard-template.mjs — the single source for the CRM dashboard UI (HTML + CSS + client JS).

   Two ways over the same markup:
     • Static  (build-dashboard.mjs) — data baked in, read-only. Opens as a file, works offline.
     • Live    (crm-worker)          — data fetched from /api/clients, editable. Edits POST back and
                                       the Worker commits them to the markdown records in git.

   Pure/fs-free so the Worker can import it. Views: Todos (next action due) and Pipeline (big cards
   grouped by stage) + a per-client drawer with contact, editable fields, freeform notes, and timeline. */

// Default stages + labels. Records may use any stage string; unknown values fall back to the raw value.
// Default order matches crm.mjs (override there with CRM_STAGES). Unknown stages still render as their
// own group at the end, so a custom CRM_STAGES pipeline works without touching this file.
const STAGES = ['lead', 'contacted', 'meeting', 'proposal', 'won', 'lost', 'dormant'];
const STAGE_LABEL = { lead: 'Lead', contacted: 'Contacted', meeting: 'Meeting', proposal: 'Proposal', won: 'Won', lost: 'Lost', dormant: 'Dormant' };

export function dashboardHTML({ clientsJson = null, editable = false, title = 'CRM · Dashboard' } = {}) {
  const bootstrap = clientsJson
    ? `let CLIENTS = ${clientsJson.replace(/</g, '\\u003c')}; boot();`
    : `let CLIENTS = []; refresh().then(boot);`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${title}</title>
<style>
  :root { color-scheme: dark; --bg:#0d141c; --card:#141d28; --card-2:#0c141d; --line:#243343; --ink:#e6edf3; --muted:#8b9bab; --brand:#3fae9d; --ok:#3fb56a; --warn:#e0a44a; --bad:#e06a5a; }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--ink); font:15px/1.55 system-ui, -apple-system, Segoe UI, Roboto, sans-serif; }
  a { color:var(--brand); }
  header.top { position:sticky; top:0; z-index:20; background:rgba(13,20,28,.94); backdrop-filter:blur(8px); border-bottom:1px solid var(--line); }
  .bar { display:flex; align-items:center; gap:14px; padding:12px 18px; flex-wrap:wrap; }
  .bar h1 { font-size:17px; margin:0; }
  .bar .mode { font-size:12px; color:var(--muted); border:1px solid var(--line); border-radius:999px; padding:3px 10px; }
  .bar .mode.live { color:var(--ok); border-color:var(--ok); }
  .bar .spacer { flex:1; }
  .bar input.search { background:var(--card-2); border:1px solid var(--line); color:var(--ink); border-radius:9px; padding:8px 12px; font:inherit; min-width:180px; }
  nav.tabs { display:flex; gap:4px; padding:0 12px 8px; flex-wrap:wrap; }
  nav.tabs button { font:inherit; font-weight:600; color:var(--muted); background:transparent; border:1px solid transparent; border-radius:9px; padding:8px 14px; cursor:pointer; }
  nav.tabs button .n { font-weight:700; opacity:.7; margin-left:6px; font-size:12px; }
  nav.tabs button.active { color:var(--ink); background:var(--card); border-color:var(--line); }
  main { max-width:1100px; margin:0 auto; padding:18px; }
  .empty { color:var(--muted); padding:40px 0; text-align:center; }
  .grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(420px,1fr)); gap:16px; }
  @media (max-width:520px){ .grid { grid-template-columns:1fr; } }
  .card { background:var(--card); border:1px solid var(--line); border-radius:14px; padding:18px 20px; cursor:pointer; transition:border-color .12s; }
  .card:hover { border-color:var(--brand); }
  .card .chead { display:flex; justify-content:space-between; align-items:flex-start; gap:10px; }
  .card h3 { margin:0 0 2px; font-size:19px; }
  .card .meta { color:var(--muted); font-size:14px; margin:2px 0; }
  .stage-group { margin-bottom:26px; }
  .group-h { display:flex; align-items:center; gap:8px; margin:0 0 12px; font-size:13px; text-transform:uppercase; letter-spacing:.05em; color:var(--muted); }
  .group-h span { font-size:12px; opacity:.7; }
  .badge { display:inline-block; font-size:10.5px; text-transform:uppercase; letter-spacing:.05em; font-weight:700; padding:2px 8px; border-radius:999px; border:1px solid var(--line); color:var(--muted); white-space:nowrap; }
  .b-won,.b-proposal { color:var(--ok); border-color:var(--ok); }
  .b-contacted,.b-meeting { color:var(--brand); border-color:var(--brand); }
  .b-lost { color:var(--bad); border-color:var(--bad); }
  .due { font-size:12.5px; margin-top:8px; }
  .due.overdue { color:var(--bad); } .due.today { color:var(--warn); } .due.soon { color:var(--muted); }
  .row-actions { margin-top:10px; display:flex; gap:8px; flex-wrap:wrap; }
  .btn { font:inherit; font-size:13px; font-weight:600; border-radius:8px; padding:7px 12px; border:1px solid var(--line); background:transparent; color:var(--ink); cursor:pointer; }
  .btn.primary { border-color:var(--brand); color:var(--brand); }
  .scrim { position:fixed; inset:0; background:rgba(0,0,0,.55); display:none; z-index:40; }
  .scrim.open { display:block; }
  .drawer { position:fixed; top:0; right:0; height:100%; width:min(560px,100%); background:var(--bg); border-left:1px solid var(--line); z-index:50; transform:translateX(100%); transition:transform .18s ease; overflow-y:auto; }
  .drawer.open { transform:translateX(0); }
  .drawer .dhead { position:sticky; top:0; background:var(--bg); border-bottom:1px solid var(--line); padding:16px 18px; display:flex; align-items:flex-start; gap:10px; }
  .drawer .dhead h2 { margin:0; font-size:20px; }
  .drawer .dbody { padding:16px 18px; }
  .drawer .x { margin-left:auto; background:transparent; border:1px solid var(--line); color:var(--ink); border-radius:8px; width:34px; height:34px; cursor:pointer; font-size:18px; }
  .kv { color:var(--muted); font-size:14px; margin:4px 0; }
  .sec-title { text-transform:uppercase; font-size:12px; letter-spacing:.05em; color:var(--muted); margin:20px 0 8px; }
  .tl { list-style:none; margin:0; padding:0; border-left:2px solid var(--line); }
  .tl li { position:relative; padding:0 0 14px 16px; }
  .tl li::before { content:''; position:absolute; left:-5px; top:6px; width:8px; height:8px; border-radius:50%; background:var(--brand); }
  .tl .d { color:var(--muted); font-size:12px; } .tl .e { font-weight:600; } .tl .n { color:var(--muted); font-size:13.5px; }
  .fld { display:grid; gap:4px; margin:8px 0; }
  .fld label { font-size:12px; color:var(--muted); text-transform:uppercase; letter-spacing:.04em; }
  .fld input, .fld textarea { width:100%; background:var(--card-2); color:var(--ink); border:1px solid var(--line); border-radius:8px; padding:9px; font:inherit; }
  textarea { resize:vertical; }
  .stagebtns { display:flex; gap:6px; flex-wrap:wrap; }
  .notes-read { white-space:pre-wrap; color:var(--ink); font-size:14px; }
  .toast { position:fixed; bottom:18px; left:50%; transform:translateX(-50%); background:var(--card); border:1px solid var(--line); border-radius:10px; padding:10px 16px; z-index:60; opacity:0; transition:opacity .2s; }
  .toast.show { opacity:1; } .toast.err { border-color:var(--bad); color:var(--bad); }
</style>
</head>
<body>
<header class="top">
  <div class="bar">
    <h1>CRM</h1>
    <span class="mode ${editable ? 'live' : ''}">${editable ? '● Live · edits saved to git' : 'Read-only'}</span>
    <span class="spacer"></span>
    <input class="search" type="search" placeholder="Search clients…" oninput="render()">
  </div>
  <nav class="tabs" id="tabs"></nav>
</header>
<main id="view"></main>
<div class="scrim" id="scrim" onclick="closeDrawer()"></div>
<aside class="drawer" id="drawer" aria-hidden="true"></aside>
<div class="toast" id="toast"></div>

<script>
const EDITABLE = ${editable ? 'true' : 'false'};
const STAGES = ${JSON.stringify(STAGES)};
const STAGE_LABEL = ${JSON.stringify(STAGE_LABEL)};
const TABS = ['Todos', 'Pipeline'];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const todayStr = new Date().toISOString().slice(0,10);
let tab = 'Pipeline', openSlug = null;

function toast(msg, err){ const t=document.getElementById('toast'); t.textContent=msg; t.className='toast show'+(err?' err':''); setTimeout(()=>t.className='toast',2200); }
async function refresh(){ try { const r=await fetch('/api/clients',{headers:{accept:'application/json'}}); if(!r.ok) throw new Error(r.status); CLIENTS=await r.json(); } catch(e){ toast('Could not load clients: '+e.message,true); } }
async function save(slug, patch){
  const r = await fetch('/api/clients/'+encodeURIComponent(slug), { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify(patch) });
  if(!r.ok){ toast('Save failed ('+r.status+')',true); return false; }
  const updated = await r.json();
  const i = CLIENTS.findIndex(c=>c.slug===slug); if(i>-1) CLIENTS[i]=updated;
  toast('Saved ✓'); render(); if(openSlug===slug) openDrawer(slug); return true;
}

function stageLabel(s){ return STAGE_LABEL[s] || (s ? s.charAt(0).toUpperCase()+s.slice(1) : ''); }
function badge(s){ return \`<span class="badge b-\${esc(s)}">\${esc(stageLabel(s))}</span>\`; }
function metaLine(c){ return [c.phone, c.email].filter(Boolean).map(esc).join(' · '); }
function dueClass(d){ if(!d) return ''; if(d<todayStr) return 'overdue'; if(d===todayStr) return 'today'; return 'soon'; }
function dueLabel(d){ if(!d) return ''; if(d<todayStr) return 'Overdue · '+d; if(d===todayStr) return 'Due today'; return 'Due '+d; }
function filtered(){ const q=(document.querySelector('.search').value||'').toLowerCase().trim(); return q?CLIENTS.filter(c=>(c.name+' '+c.email+' '+c.stage+' '+c.notes).toLowerCase().includes(q)):CLIENTS; }

function renderTabs(){
  const counts = { Todos:CLIENTS.filter(c=>c.nextActionDate&&c.nextActionDate<=todayStr).length, Pipeline:CLIENTS.length };
  document.getElementById('tabs').innerHTML = TABS.map(t=>\`<button class="\${t===tab?'active':''}" onclick="tab='\${t}';render()">\${t}<span class="n">\${counts[t]}</span></button>\`).join('');
}
function card(c){
  return \`<div class="card" onclick="openDrawer('\${c.slug}')">
    <div class="chead"><h3>\${esc(c.name)}</h3>\${badge(c.stage)}</div>
    \${metaLine(c)?\`<div class="meta">\${metaLine(c)}</div>\`:''}
    \${c.nextAction?\`<div class="due \${dueClass(c.nextActionDate)}">\${esc(dueLabel(c.nextActionDate)||'')} — \${esc(c.nextAction)}</div>\`:''}
  </div>\`;
}
function viewTodos(l){ const t=l.filter(c=>c.nextActionDate&&c.nextActionDate<=todayStr).sort((a,b)=>a.nextActionDate.localeCompare(b.nextActionDate)); return t.length?'<div class="grid">'+t.map(card).join('')+'</div>':'<div class="empty">Nothing due. You\\'re clear. 🎉</div>'; }
function viewPipeline(l){ const known=STAGES.map(s=>({s,items:l.filter(c=>c.stage===s)})); const extra=[...new Set(l.map(c=>c.stage).filter(s=>!STAGES.includes(s)))].map(s=>({s,items:l.filter(c=>c.stage===s)})); const cols=[...known,...extra].filter(c=>c.items.length); return cols.length?cols.map(col=>\`<div class="stage-group"><h4 class="group-h">\${esc(stageLabel(col.s))} <span>\${col.items.length}</span></h4><div class="grid">\${col.items.map(card).join('')}</div></div>\`).join(''):'<div class="empty">No clients.</div>'; }
function render(){ renderTabs(); const l=filtered(); document.getElementById('view').innerHTML = tab==='Todos'?viewTodos(l):viewPipeline(l); }

function editBlock(c){
  if(!EDITABLE) return c.notes?\`<div class="sec-title">Notes</div><div class="notes-read">\${esc(c.notes)}</div>\`:'';
  const stageBtns = STAGES.map(s=>\`<button class="btn" onclick="markStage('\${c.slug}','\${s}')">\${esc(stageLabel(s))}</button>\`).join('');
  return \`
    <div class="sec-title">Update</div>
    <div class="stagebtns">\${stageBtns}</div>
    <div class="fld"><label>Next action</label><input id="e-next" value="\${esc(c.nextAction||'')}"></div>
    <div class="fld"><label>Due date</label><input id="e-due" type="date" value="\${esc(c.nextActionDate||'')}"></div>
    <div class="row-actions"><button class="btn primary" onclick="saveNext('\${c.slug}')">Save next action</button></div>
    <div class="fld"><label>Email</label><input id="e-email" value="\${esc(c.email||'')}"></div>
    <div class="fld"><label>Phone</label><input id="e-phone" value="\${esc(c.phone||'')}"></div>
    <div class="row-actions"><button class="btn" onclick="saveContact('\${c.slug}')">Save contact</button></div>
    <div class="sec-title">Notes</div>
    <div class="fld"><textarea id="e-notes" rows="5">\${esc(c.notes||'')}</textarea></div>
    <div class="row-actions"><button class="btn" onclick="saveNotes('\${c.slug}')">Save notes</button></div>
    <div class="fld"><label>Log a touch (adds a timeline entry)</label><textarea id="e-note" rows="2" placeholder="e.g. Called, left voicemail"></textarea></div>
    <div class="row-actions"><button class="btn" onclick="logNote('\${c.slug}')">Log touch</button></div>\`;
}
function openDrawer(slug){
  const c=CLIENTS.find(x=>x.slug===slug); if(!c) return; openSlug=slug;
  const tl=c.timeline&&c.timeline.length?'<ul class="tl">'+c.timeline.slice().reverse().map(t=>\`<li><div class="d">\${esc(t.date)}</div><div class="e">\${esc(t.event)}</div>\${t.note?\`<div class="n">\${esc(t.note)}</div>\`:''}</li>\`).join('')+'</ul>':'<div class="kv">No timeline yet.</div>';
  document.getElementById('drawer').innerHTML=\`
    <div class="dhead"><div><h2>\${esc(c.name)}</h2><div style="margin-top:6px">\${badge(c.stage)}</div></div><button class="x" onclick="closeDrawer()">×</button></div>
    <div class="dbody">
      \${c.nextAction?\`<div class="due \${dueClass(c.nextActionDate)}">\${esc(dueLabel(c.nextActionDate)||'Next')} — \${esc(c.nextAction)}</div>\`:''}
      <div class="sec-title">Contact</div>
      <div class="kv">Phone: \${c.phone?esc(c.phone):'—'}</div>
      <div class="kv">Email: \${c.email?esc(c.email):'—'}</div>
      \${editBlock(c)}
      <div class="sec-title">Timeline</div>
      \${tl}
    </div>\`;
  document.getElementById('drawer').classList.add('open'); document.getElementById('scrim').classList.add('open');
}
function closeDrawer(){ openSlug=null; document.getElementById('drawer').classList.remove('open'); document.getElementById('scrim').classList.remove('open'); }
async function markStage(slug, stage){ await save(slug,{stage, event:stageLabel(stage).toLowerCase()}); }
async function saveNext(slug){ await save(slug,{ next_action:document.getElementById('e-next').value, next_action_date:document.getElementById('e-due').value }); }
async function saveContact(slug){ await save(slug,{ email:document.getElementById('e-email').value, phone:document.getElementById('e-phone').value }); }
async function saveNotes(slug){ await save(slug,{ notes:document.getElementById('e-notes').value }); }
async function logNote(slug){ const n=document.getElementById('e-note').value.trim(); if(!n) return; await save(slug,{ event:'note', note:n }); }
document.addEventListener('keydown', e=>{ if(e.key==='Escape') closeDrawer(); });
function boot(){ render(); }
${bootstrap}
</script>
</body>
</html>`;
}
