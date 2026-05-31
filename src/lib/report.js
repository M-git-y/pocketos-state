'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const STATE_FILE  = path.join(os.homedir(), '.pocketos-state.json');
const IGNITE_FILE = path.join(os.homedir(), '.pocketos-ignite.json');
const REPORT_DIR  = path.join(os.homedir(), 'pocketos-report');
const REPORT_FILE = path.join(REPORT_DIR, 'index.html');

function loadJSON(f) { try { return JSON.parse(fs.readFileSync(f,'utf8')); } catch(_) { return null; } }

const METRICS = {
  energy:    { label:'能量',     emoji:'⚡',color:'#f59e0b' },
  clarity:   { label:'清醒度',   emoji:'🧠',color:'#6366f1' },
  mood:      { label:'心境',     emoji:'🌤️',color:'#10b981' },
  body:      { label:'身体感',   emoji:'💪',color:'#ef4444' },
  face:      { label:'面部活力', emoji:'😊',color:'#ec4899' },
  readiness: { label:'行动意愿', emoji:'🚀',color:'#00d4ff' },
};

const METRIC_KEYS = Object.keys(METRICS);

function buildSVGChart(entries, key, w=580, h=110) {
  const m = METRICS[key];
  const pts = entries.map((e,i)=> e.metrics&&e.metrics[key]? {i,v:e.metrics[key]} :null).filter(Boolean);
  if(pts.length<2) return `<div class="chart-empty">需要 2 条以上数据</div>`;
  const p={t:8,r:8,b:22,l:22}, wt=w-p.l-p.r, ht=h-p.t-p.b;
  let x=i=>p.l+(i/(pts.length-1))*wt, y=v=>p.t+ht-((v-1)/9)*ht;
  let d='',a=''; pts.forEach((p,i)=>{ d+=(i?'L':'M')+` ${x(i).toFixed(1)} ${y(p.v).toFixed(1)}`; });
  a=d+` L ${x(pts.length-1).toFixed(1)} ${y(1).toFixed(1)} L ${x(0).toFixed(1)} ${y(1).toFixed(1)} Z`;
  let g='', yl=''; for(let v=1;v<=10;v+=3){g+=`<line x1="${p.l}" y1="${y(v)}" x2="${w-p.r}" y2="${y(v)}" class="cg"/>`;yl+=`<text x="${p.l-3}" y="${y(v)+3}" class="cl">${v}</text>`;}
  let ds=''; pts.forEach((p,i)=>{ ds+=`<circle cx="${x(i).toFixed(1)}" cy="${y(p.v).toFixed(1)}" r="3" fill="${m.color}" stroke="#1a1d2e" stroke-width="1"/>`; });
  return `<svg viewBox="0 0 ${w} ${h}" class="cs">${g}${yl}<path d="${a}" fill="${m.color}15" stroke="none"/><path d="${d}" fill="none" stroke="${m.color}" stroke-width="2" stroke-linecap="round"/></svg>`;
}

function buildHTML(embeddedData) {
  const stateD = embeddedData || loadJSON(STATE_FILE) || {entries:[]};
  const igniteD = loadJSON(IGNITE_FILE) || {records:[]};
  const entries = stateD.entries||[];
  const records = igniteD.records||[];
  const now = new Date();
  const dateStr=now.toISOString().slice(0,10), timeStr=now.toLocaleTimeString('zh-CN');
  const latest=entries.length>0?entries[entries.length-1]:null;
  const first=entries.length>0?entries[0]:null;

  const daySet=new Set(); entries.forEach(e=>daySet.add(new Date(e.ts).toDateString()));
  const sdays=Array.from(daySet).sort().reverse(); let streak=0;
  for(let i=0;i<sdays.length;i++){ if(sdays[i]===new Date(Date.now()-i*864e5).toDateString()) streak++; else break; }

  const todayStart=new Date().setHours(0,0,0,0);
  const todayE=entries.filter(e=>e.ts>todayStart);
  const igniteToday=records.filter(r=>r.ts>todayStart);
  const igniteAll=records.filter(r=>r.action==='ignition').length;

  // ── embedded data JSON for offline mode ───
  const embeddedJSON = JSON.stringify({entries:entries.slice(-50)});

  // ── metric labels for form ───
  const metricFormFields = METRIC_KEYS.map(k=>{
    const m=METRICS[k];
    return `{key:'${k}',emoji:'${m.emoji}',label:'${m.label}',color:'${m.color}'}`;
  }).join(',');

  const actionLabels={
    'face-pump':'面部泵血','leg-raise':'直腿抬举','upper-cardio':'上肢有氧',
    'deep-breath':'深呼吸','micro-walk':'步行','stand-stretch':'拉伸','ignition':'点火','posture-fix':'姿态'
  };

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>PocketOS Dashboard</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0f1117;color:#e2e8f0;min-height:100vh}
.c{max-width:720px;margin:0 auto;padding:16px 14px 60px}
/* header */
.hd{text-align:center;padding:24px 0 16px}
.hd h1{font-size:24px;background:linear-gradient(135deg,#00d4ff,#6366f1,#ec4899);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}
.hd .sub{color:#64748b;font-size:12px;margin-top:4px}
/* config bar */
.cfg{background:#1a1d2e;border-radius:10px;padding:10px 14px;margin-bottom:12px;display:flex;flex-wrap:wrap;gap:8px;align-items:center;font-size:12px}
.cfg input{background:#0f1117;border:1px solid #252840;color:#e2e8f0;padding:6px 10px;border-radius:6px;font-size:12px;width:100px}
.cfg .cfg-token{width:140px}
.cfg button{background:#6366f1;color:#fff;border:none;padding:6px 14px;border-radius:6px;font-size:12px;cursor:pointer}
.cfg .cfg-st{font-size:11px}
.cfg .cfg-on{color:#10b981}.cfg .cfg-off{color:#f59e0b}
/* score cards */
.sg{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin:12px 0}
.sc{background:#1a1d2e;border-radius:10px;padding:14px 8px;text-align:center;border:1px solid #252840}
.sc .se{font-size:22px}
.sc .sv{font-size:32px;font-weight:700;line-height:1.2}
.sc .sl{font-size:10px;color:#94a3b8;margin-top:2px}
.du{color:#10b981;font-weight:600;font-size:10px}
.dd{color:#ef4444;font-weight:600;font-size:10px}
/* sections */
.section{margin:20px 0}
.st{font-size:15px;font-weight:600;color:#94a3b8;padding-bottom:8px;border-bottom:1px solid #1e2332;margin-bottom:10px}
/* capture form */
.cf{background:linear-gradient(135deg,#1a1d2e,#252840);border-radius:12px;padding:16px;margin:12px 0;border:1px solid #333}
.cf-title{font-size:14px;font-weight:600;color:#94a3b8;margin-bottom:12px}
.cf-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.cf-row{display:flex;align-items:center;gap:6px;background:#0f1117;border-radius:6px;padding:5px 8px}
.cf-row span.e{font-size:16px;flex-shrink:0}
.cf-row span.l{font-size:10px;color:#64748b;width:48px}
.cf-row input[type=range]{flex:1;accent-color:#00d4ff;height:4px}
.cf-row span.v{color:#00d4ff;font-weight:700;font-size:13px;width:18px;text-align:center}
.cf textarea{grid-column:1/-1;width:100%;background:#0f1117;border:none;border-radius:6px;padding:8px 10px;color:#e2e8f0;font:inherit;resize:vertical}
.cf-btn{grid-column:1/-1;display:flex;gap:8px}
.cf-btn button{flex:1;padding:10px;background:linear-gradient(135deg,#00d4ff,#6366f1);border:none;border-radius:8px;color:#fff;font-weight:700;font-size:13px;cursor:pointer}
.cf-status{font-size:11px;text-align:center;margin-top:8px}
/* timeline */
.ti{background:#1a1d2e;border-radius:10px;padding:10px 12px;margin-bottom:6px;border-left:3px solid #252840}
.ti.ign{border-left-color:#f59e0b}
.ti-h{display:flex;align-items:center;gap:6px;margin-bottom:4px}
.ti-ctx{font-size:9px;font-weight:700;padding:1px 6px;border-radius:8px;text-transform:uppercase}
.ti-ctx.ign{background:#f59e0b22;color:#f59e0b}
.ti-ctx.man{background:#00d4ff22;color:#00d4ff}
.ti-ctx.web{background:#10b98122;color:#10b981}
.ti-time{font-size:10px;color:#64748b}
.ti-shift{font-size:9px;font-weight:700;padding:1px 5px;border-radius:6px}
.ti-shift.up{background:#10b98122;color:#10b981}
.ti-shift.dn{background:#ef444422;color:#ef4444}
.ti-scores{font-size:12px;display:flex;flex-wrap:wrap;gap:6px}
.ti-note{color:#94a3b8;font-style:italic;font-size:12px;margin-top:3px;padding-left:6px;border-left:2px solid #252840}
/* charts */
.cr{display:flex;gap:8px;margin-bottom:8px}
.cc{flex:1;background:#1a1d2e;border-radius:8px;padding:10px;border:1px solid #252840;min-width:0}
.ct{font-size:11px;color:#94a3b8;margin-bottom:6px}
.cs{width:100%;height:auto;display:block}
.cg{stroke:#1e2332;stroke-width:1}
.cl{font-size:8px;fill:#64748b;font-family:monospace}
.chart-empty{color:#64748b;font-size:11px;text-align:center;padding:16px 0}
/* stats */
.stg{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-bottom:12px}
.stb{background:#1a1d2e;border-radius:8px;padding:12px 6px;text-align:center;border:1px solid #252840}
.stn{font-size:24px;font-weight:700;background:linear-gradient(135deg,#f59e0b,#ef4444);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}
.std{font-size:9px;color:#64748b;margin-top:2px}
/* action bars */
.ab{background:#1a1d2e;border-radius:8px;padding:10px;border:1px solid #252840}
.abi{display:flex;align-items:center;gap:8px;padding:4px 0}
.abi .al{width:70px;font-size:10px;color:#94a3b8;text-align:right;flex-shrink:0}
.abi .af{flex:1;height:5px;background:#1e2332;border-radius:3px;overflow:hidden}
.abi .af div{height:100%;background:linear-gradient(90deg,#00d4ff,#6366f1);border-radius:3px}
.abi .ac{font-size:10px;color:#64748b;width:20px;text-align:left}
.empty{text-align:center;padding:24px;color:#64748b;font-size:12px}
.empty code{color:#00d4ff;background:#1e2332;padding:2px 6px;border-radius:4px}
footer{text-align:center;padding:16px 0;color:#475569;font-size:10px}
footer a{color:#6366f1;text-decoration:none}
@media(max-width:480px){.sg{grid-template-columns:repeat(2,1fr)}.stg{grid-template-columns:repeat(2,1fr)}.cr{flex-direction:column}.cf-grid{grid-template-columns:1fr}}
</style></head>
<body><div class="c">
<div class="hd"><h1>PocketOS State Dashboard</h1><div class="sub" id="hd-sub">Generated ${dateStr} · <span id="entry-count">${entries.length}</span> entries · <span id="streak-count">${streak}</span> day streak</div></div>

<!-- Config Bar -->
<div class="cfg" id="cfg-bar">
  <span style="color:#64748b">⚙</span>
  <input id="cfg-owner" placeholder="GitHub user" value="">
  <span style="color:#64748b">/</span>
  <input id="cfg-repo" placeholder="repo name" value="" style="width:130px">
  <input id="cfg-token" class="cfg-token" placeholder="Token (ghp_...)" type="password" value="">
  <button onclick="saveCfg()">连接</button>
  <span class="cfg-st" id="cfg-status">离线模式</span>
</div>

<!-- Capture Form -->
<div class="cf">
  <div class="cf-title">📝 Capture State</div>
  <div class="cf-grid" id="capture-form">
    <!-- filled by JS -->
  </div>
  <div class="cf-status" id="cf-msg"></div>
</div>

<!-- Score Cards -->
<div class="section"><div class="st">📊 Current State</div><div class="sg" id="score-cards"></div></div>

<!-- Stats -->
<div class="section"><div class="st">🔥 Stats</div>
  <div class="stg" id="stats-grid"></div>
  <div class="ab" id="action-bars"></div>
</div>

<!-- Charts -->
<div class="section"><div class="st">📈 Trends</div><div id="charts-area"></div></div>

<!-- Timeline -->
<div class="section"><div class="st">📋 Timeline</div><div id="timeline-area"></div></div>

<footer><p>PocketOS — Body-System Interface</p><p id="footer-mode">Mode: local</p><p style="margin-top:4px;opacity:.5">境随心转 · 斗转星移</p></footer>
</div>

<script>
// ─── CONFIG ───────────────────────────────────────────────────────
const METRICS = [${metricFormFields}];
const EMBEDDED = ${embeddedJSON};
let entries = EMBEDDED.entries || [];
let records = ${JSON.stringify(records)};
let githubCfg = { owner:'', repo:'', token:'' };

// load saved config from localStorage
try {
  const saved = JSON.parse(localStorage.getItem('pos-cfg')||'{}');
  if(saved.owner) githubCfg = saved;
  if(githubCfg.owner) document.getElementById('cfg-owner').value = githubCfg.owner;
  if(githubCfg.repo) document.getElementById('cfg-repo').value = githubCfg.repo;
  if(githubCfg.token) document.getElementById('cfg-token').value = githubCfg.token;
} catch(_){}

// ─── RENDER ───────────────────────────────────────────────────────
function formatDate(ts){
  const d=new Date(ts);
  return d.toLocaleString('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'});
}

function renderAll(){
  const now=Date.now(), todayStart=new Date().setHours(0,0,0,0);
  const todayE=entries.filter(e=>e.ts>todayStart);
  const todayR=records.filter(r=>r.ts>todayStart);
  const latest=entries.length>0?entries[entries.length-1]:null;
  const first=entries.length>0?entries[0]:null;

  // score cards
  let sc='';
  if(latest && latest.metrics){
    METRICS.forEach(m=>{
      const v=latest.metrics[m.key];
      const fv=first&&first.metrics?first.metrics[m.key]:null;
      const d=fv!==null&&v!==null?v-fv:null;
      const dh=d!==null&&d!==0?\`<span class="\${d>0?'du':'dd'}">\${d>0?'+':''}\${d}</span>\`:'';
      sc+=\`<div class="sc"><div class="se">\${m.emoji}</div><div class="sv" style="color:\${m.color}">\${v||'—'}</div><div class="sl">\${m.label} \${dh}</div></div>\`;
    });
  } else { sc='<div class="empty" style="grid-column:1/-1">运行 <code>pos state</code> 或下方表单记录</div>'; }
  document.getElementById('score-cards').innerHTML=sc;

  // stats
  const ic=records.filter(r=>r.action==='ignition').length;
  const ac={}; records.forEach(r=>{ac[r.action]=(ac[r.action]||0)+1;});
  document.getElementById('stats-grid').innerHTML=\`
    <div class="stb"><div class="stn">\${ic}</div><div class="std">点火次数</div></div>
    <div class="stb"><div class="stn">\${records.length}</div><div class="std">总动作</div></div>
    <div class="stb"><div class="stn">\${todayR.length}</div><div class="std">今日动作</div></div>
    <div class="stb"><div class="stn">\${streak()}</div><div class="std">连续天数</div></div>\`;

  const actionLabels={'face-pump':'面部泵血','leg-raise':'直腿抬举','upper-cardio':'上肢有氧','deep-breath':'深呼吸','micro-walk':'步行','stand-stretch':'拉伸','ignition':'点火','posture-fix':'姿态'};
  let ab='';
  Object.entries(ac).sort((a,b)=>b[1]-a[1]).forEach(([k,c])=>{
    const pct=Math.round(c/records.length*100)||0;
    ab+=\`<div class="abi"><span class="al">\${actionLabels[k]||k}</span><div class="af"><div style="width:\${pct}%\"></div></div><span class="ac">\${c}</span></div>\`;
  });
  if(!ab) ab='<div class="empty">暂无动作记录</div>';
  document.getElementById('action-bars').innerHTML=ab;

  // charts
  let charts='';
  if(entries.length>=2){
    for(let i=0;i<METRICS.length;i+=2){
      const m1=METRICS[i], m2=METRICS[i+1];
      let row=\`<div class="cr"><div class="cc"><div class="ct">\${m1.emoji} \${m1.label}</div><div id="chart-\${m1.key}"></div></div>\`;
      if(m2) row+=\`<div class="cc"><div class="ct">\${m2.emoji} \${m2.label}</div><div id="chart-\${m2.key}"></div></div>\`;
      row+='</div>'; charts+=row;
    }
    document.getElementById('charts-area').innerHTML=charts;
    // draw charts after DOM update
    setTimeout(()=>{
      METRICS.forEach(m=>{
        const el=document.getElementById('chart-'+m.key);
        if(el) el.innerHTML=buildSVG(entries,m.key);
      });
    },10);
  } else { document.getElementById('charts-area').innerHTML='<div class="empty">需要 2 条以上状态记录才能显示趋势图</div>'; }

  // timeline
  let tl='';
  if(entries.length>0){
    entries.slice(-30).reverse().forEach((e,i)=>{
      const ei=entries.indexOf(e);
      const prev=ei>0&&entries[ei-1].metrics?entries[ei-1].metrics:null;
      let shift=0; if(prev&&e.metrics) METRICS.forEach(m=>{if(prev[m.key]!==undefined&&e.metrics[m.key]!==undefined) shift+=e.metrics[m.key]-prev[m.key];});
      const sh=shift!==0?\`<span class="ti-shift \${shift>0?'up':'dn'}">\${shift>0?'+':''}\${shift}</span>\`:'';

      let scores=''; METRICS.forEach(m=>{
        if(e.metrics[m.key]!==undefined) scores+=\`<span style="font-size:12px;color:\${m.color}">\${m.emoji}\${e.metrics[m.key]}</span> \`;
      });
      const ctx=e.context||'manual';
      tl+=\`<div class="ti \${ctx==='ignite'?'ign':''}">
        <div class="ti-h"><span class="ti-ctx \${ctx==='ignite'?'ign':ctx==='web'?'web':'man'}">\${ctx.toUpperCase()}</span><span class="ti-time">\${formatDate(e.ts)}</span>\${sh}</div>
        <div class="ti-scores">\${scores}</div>
        \${e.note?\`<div class="ti-note">"\${e.note}"</div>\`:''}
      </div>\`;
    });
  } else { tl='<div class="empty">尚无状态记录</div>'; }
  document.getElementById('timeline-area').innerHTML=tl;

  // update header
  document.getElementById('entry-count').textContent=entries.length;
  document.getElementById('streak-count').textContent=streak();
}

function streak(){
  const ds=new Set(); entries.forEach(e=>ds.add(new Date(e.ts).toDateString()));
  const sd=Array.from(ds).sort().reverse(); let s=0;
  for(let i=0;i<sd.length;i++){ if(sd[i]===new Date(Date.now()-i*864e5).toDateString()) s++; else break; }
  return s;
}

// ─── SVG CHART ────────────────────────────────────────────────────
function buildSVG(entries,key,w=560,h=100){
  const m=METRICS.find(x=>x.key===key);
  const pts=entries.map((e,i)=>e.metrics&&e.metrics[key]?{i,v:e.metrics[key]}:null).filter(Boolean);
  if(pts.length<2) return '<div class="chart-empty">需要更多数据</div>';
  const p={t:6,r:6,b:20,l:20},wt=w-p.l-p.r,ht=h-p.t-p.b;
  const x=i=>p.l+(i/(pts.length-1))*wt, y=v=>p.t+ht-((v-1)/9)*ht;
  let d='',a=''; pts.forEach((pt,i)=>{ d+=(i?'L':'M')+\` \${x(i).toFixed(1)} \${y(pt.v).toFixed(1)}\`; });
  a=d+\` L \${x(pts.length-1).toFixed(1)} \${y(1).toFixed(1)} L \${x(0).toFixed(1)} \${y(1).toFixed(1)} Z\`;
  let g='',yl='';
  for(let v=1;v<=10;v+=3){g+=\`<line x1="\${p.l}" y1="\${y(v)}" x2="\${w-p.r}" y2="\${y(v)}" class="cg"/>\`;yl+=\`<text x="\${p.l-3}" y="\${y(v)+3}" class="cl">\${v}</text>\`;}
  return \`<svg viewBox="0 0 \${w} \${h}" class="cs">\${g}\${yl}<path d="\${a}" fill="\${m.color}15"/><path d="\${d}" fill="none" stroke="\${m.color}" stroke-width="2"/></svg>\`;
}

// ─── CAPTURE FORM ─────────────────────────────────────────────────
function buildCaptureForm(){
  let html='';
  METRICS.forEach(m=>{
    html+=\`<div class="cf-row">
      <span class="e">\${m.emoji}</span><span class="l">\${m.label}</span>
      <input type="range" id="cf-\${m.key}" min="1" max="10" value="5" oninput="document.getElementById('cv-\${m.key}').textContent=this.value">
      <span class="v" id="cv-\${m.key}">5</span>
    </div>\`;
  });
  html+=\`<textarea id="cf-note" placeholder="一句话感受..." rows="2"></textarea>\`;
  html+=\`<div class="cf-btn"><button id="cf-save-btn" onclick="captureState()">💾 Save State</button></div>\`;
  document.getElementById('capture-form').innerHTML=html;
}

// ─── GITHUB API ────────────────────────────────────────────────────
async function captureState(){
  const btn=document.getElementById('cf-save-btn');
  const msg=document.getElementById('cf-msg');
  const metrics={}; METRICS.forEach(m=>{ metrics[m.key]=parseInt(document.getElementById('cf-'+m.key).value); });
  const note=document.getElementById('cf-note').value.trim();
  const entry={ts:Date.now(),context:'web',metrics,note};

  // Local save first (always works)
  entries.push(entry);
  renderAll();
  msg.innerHTML='<span style="color:#10b981">✓ Saved locally · <button onclick="downloadBackup()" style="background:none;border:none;color:#6366f1;cursor:pointer;text-decoration:underline;font-size:11px">Download backup</button></span>';
  btn.textContent='✅ Saved!'; setTimeout(()=>{btn.textContent='💾 Save State';},3000);

  // Try cloud save via GitHub API
  if(githubCfg.token && githubCfg.owner && githubCfg.repo){
    msg.innerHTML='<span style="color:#f59e0b">⏳ Syncing to GitHub...</span>';
    try {
      // 1. Read current state file from GitHub to get SHA
      const apiUrl=\`https://api.github.com/repos/\${githubCfg.owner}/\${githubCfg.repo}/contents/data/state.json\`;
      const getRes=await fetch(apiUrl,{headers:{'Authorization':'token '+githubCfg.token}});
      if(!getRes.ok) throw new Error('Read failed: '+getRes.status);
      const fileData=await getRes.json();
      const sha=fileData.sha;
      const remoteState=JSON.parse(atob(fileData.content));
      const remoteEntries=remoteState.entries||[];

      // 2. Merge: all remote entries + our new entry (dedup by ts)
      const allTs=new Set(remoteEntries.map(e=>e.ts));
      const merged=[...remoteEntries];
      if(!allTs.has(entry.ts)) merged.push(entry);
      // Also add any local entries not in remote
      entries.forEach(e=>{if(!allTs.has(e.ts)) merged.push(e);});
      merged.sort((a,b)=>a.ts-b.ts);

      // 3. Commit to GitHub
      const content=btoa(unescape(encodeURIComponent(JSON.stringify({entries:merged},null,2))));
      const putRes=await fetch(apiUrl,{
        method:'PUT',
        headers:{'Authorization':'token '+githubCfg.token,'Content-Type':'application/json'},
        body:JSON.stringify({message:\`state: \${new Date().toISOString().slice(0,16)}\`,content,sha})
      });
      if(putRes.ok){
        msg.innerHTML='<span style="color:#10b981">✓ Saved to GitHub · Refresh page in a minute to see charts update</span>';
        // Also try to trigger Pages rebuild
        try{ await fetch(\`https://api.github.com/repos/\${githubCfg.owner}/\${githubCfg.repo}/pages/builds\`,{method:'POST',headers:{'Authorization':'token '+githubCfg.token,'Accept':'application/vnd.github+json'}}); }catch(_){}
      } else {
        const err=await putRes.json();
        msg.innerHTML=\`<span style="color:#ef4444">GitHub write failed: \${err.message||'unknown'} · <button onclick="downloadBackup()" style="background:none;border:none;color:#6366f1;cursor:pointer;text-decoration:underline;font-size:11px">下载备份</button></span>\`;
      }
    } catch(e){
      msg.innerHTML=\`<span style="color:#ef4444">Sync error: \${e.message} · <button onclick="downloadBackup()" style="background:none;border:none;color:#6366f1;cursor:pointer;text-decoration:underline;font-size:11px">下载备份</button></span>\`;
    }
  }
  updateFooter();
}

// ─── CONFIG ────────────────────────────────────────────────────────
function saveCfg(){
  githubCfg.owner=document.getElementById('cfg-owner').value.trim();
  githubCfg.repo=document.getElementById('cfg-repo').value.trim();
  githubCfg.token=document.getElementById('cfg-token').value.trim();
  localStorage.setItem('pos-cfg',JSON.stringify(githubCfg));
  document.getElementById('cfg-status').innerHTML=githubCfg.token?'<span class="cfg-on">● 已连接</span>':'<span class="cfg-off">● 离线模式</span>';
  document.getElementById('fill-cfg-hint').style.display='none';
  if(githubCfg.token){ loadFromGitHub(); }
  updateFooter();
}

async function loadFromGitHub(){
  if(!githubCfg.token||!githubCfg.owner||!githubCfg.repo) return;
  try {
    const apiUrl=\`https://api.github.com/repos/\${githubCfg.owner}/\${githubCfg.repo}/contents/data/state.json\`;
    const res=await fetch(apiUrl,{headers:{'Authorization':'token '+githubCfg.token}});
    if(!res.ok) return;
    const fd=await res.json();
    const remote=JSON.parse(atob(fd.content));
    if(remote.entries && remote.entries.length>0){
      entries=remote.entries;
      renderAll();
      document.getElementById('footer-mode').textContent='Mode: cloud (GitHub)';
      document.getElementById('cfg-status').innerHTML='<span class="cfg-on">● 已同步</span>';
    }
  } catch(_){}
}

function downloadBackup(){
  const blob=new Blob([JSON.stringify({entries},null,2)],{type:'application/json'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob);
  a.download='pocketos-state-backup-'+new Date().toISOString().slice(0,10)+'.json';
  a.click();
}

function updateFooter(){
  document.getElementById('footer-mode').textContent=githubCfg.token?'Mode: cloud (GitHub)':'Mode: local (no GitHub connected)';
}

// Auto detect owner/repo from URL (GitHub Pages)
(function(){
  const host=window.location.hostname;
  const path=window.location.pathname;
  const m=host.match(/^(.+)\.github\.io$/);
  if(m){ githubCfg.owner=m[1]; githubCfg.repo=path.split('/')[1]||''; }
  if(githubCfg.owner) document.getElementById('cfg-owner').value=githubCfg.owner;
  if(githubCfg.repo) document.getElementById('cfg-repo').value=githubCfg.repo;
})();
if(githubCfg.token){ document.getElementById('cfg-token').value=githubCfg.token; }

// Check if token is valid on load
if(githubCfg.token){
  document.getElementById('cfg-status').innerHTML='<span class="cfg-on">● 已连接</span>';
  loadFromGitHub().then(updateFooter);
} else {
  document.getElementById('cfg-status').innerHTML='<span class="cfg-off">● 离线模式</span>';
}

// ─── INIT ──────────────────────────────────────────────────────────
buildCaptureForm();
renderAll();
updateFooter();
</script></body></html>`;
}

// ─── Generate Report ─────────────────────────────────────────────────────────
function generateReport(silent = false) {
  const ui = require('./ui');
  const { c } = ui;
  const html = buildHTML();
  if (!fs.existsSync(REPORT_DIR)) fs.mkdirSync(REPORT_DIR, { recursive: true });
  fs.writeFileSync(REPORT_FILE, html);
  if (!silent) {
    console.log(c.success('\n  ✅ Report generated!'));
    console.log(c.value(`  ${REPORT_FILE}`));
    try { require('child_process').execSync(`termux-open ${REPORT_FILE}`, { stdio: 'ignore' }); console.log(c.primary('  📱 Opened in browser')); } catch (_) {}
    console.log('');
  }
  return REPORT_FILE;
}

// ─── GitHub Sync ─────────────────────────────────────────────────────────────
function syncToGitHub(repoUrl) {
  const ui = require('./ui'), { c } = ui, { execSync } = require('child_process');
  console.log(ui.header('GITHUB SYNC'));
  generateReport(true);

  const DATA_DIR = path.join(REPORT_DIR, 'data');
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (fs.existsSync(STATE_FILE))  fs.copyFileSync(STATE_FILE,  path.join(DATA_DIR, 'state.json'));
  if (fs.existsSync(IGNITE_FILE)) fs.copyFileSync(IGNITE_FILE, path.join(DATA_DIR, 'ignite.json'));

  // Write SKILL.md
  fs.writeFileSync(path.join(REPORT_DIR, 'SKILL.md'),
`# System Agent Methodology

## Core Framework

When feeling stuck (paralysis, overthinking, procrastination), apply:

### 1. Deadlock Detection
- List all things you want to do (processes)
- Find what blocks each (resources)
- Locate circular dependencies
- Break by finding a process needing ZERO blocked resources

### 2. Zero-Dependency Entry Point
- What action requires no prep, no equipment, no permission, no decision?
- Executable in <2 minutes from current position
- No "should" — only "do X now"
- Bypass brain via: Hook binding (attach to existing triggers), basal ganglia route (skip prefrontal), decision-to-action latency compression

### 3. Watchdog Model
- External timer that monitors your system
- Non-blocking interrupts when idle too long
- Single clear instruction, never advice

### 4. Action Format
- Time-boxed step sequence (like bash scripts)
- Imperative verbs (push, lift, breathe, hold)
- Specific duration/count
- Zero qualifiers ("try to", "maybe")

### 5. State Transition Language
- Describe PHYSIOLOGICAL state achieved, not "should feel"
- "Your face is warmer because blood pumped to capillaries"
- "Heart rate elevated, triggering parasympathetic rebound"

## Key Insight
**Body state drives mind state, not the reverse.**
A 90-second face pump + breath sequence creates a genuine physiological
shift that bypasses prefrontal analysis entirely.

> 境随心转 · 斗转星移
`);

  // Write README
  fs.writeFileSync(path.join(REPORT_DIR, 'README.md'),
`# PocketOS State Dashboard

Personal state tracking — mind-body interface.

- \`index.html\` — interactive dashboard with GitHub API sync
- \`data/state.json\` — 6-dimension self-assessments
- \`data/ignite.json\` — micro-habit execution log
- \`SKILL.md\` — system agent methodology

## How to use

1. Enable GitHub Pages in repo Settings → Pages → Source: main branch, / (root)
2. Visit \`https://YOUR_USER.github.io/REPO_NAME\`
3. Enter GitHub token in the config bar
4. Capture state from any device, saved directly to GitHub

Built with PocketOS CLI.

> 境随心转 · 斗转星移
`);

  const isNew = !fs.existsSync(path.join(REPORT_DIR, '.git'));
  try {
    if (isNew) {
      console.log(c.dim('  Initializing git repo...'));
      execSync('git init -b main', { cwd: REPORT_DIR, stdio: 'pipe' });
      execSync('git config user.email "pocketos@localhost"', { cwd: REPORT_DIR, stdio: 'pipe' });
      execSync('git config user.name "PocketOS"', { cwd: REPORT_DIR, stdio: 'pipe' });
    }
    execSync('git add -A', { cwd: REPORT_DIR, stdio: 'pipe' });
    const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
    let st = ''; try { st = execSync('git status --porcelain', { cwd: REPORT_DIR, encoding: 'utf8' }); } catch (_) {}
    if (st.trim()) {
      execSync(`git commit -m "state sync: ${stamp}"`, { cwd: REPORT_DIR, stdio: 'pipe' });
      console.log(c.success(`  Committed: ${stamp}`));
    } else { console.log(c.dim('  Nothing new to commit')); }
    if (repoUrl) {
      let remotes = ''; try { remotes = execSync('git remote', { cwd: REPORT_DIR, encoding: 'utf8' }); } catch (_) {}
      if (!remotes.includes('origin')) { execSync(`git remote add origin ${repoUrl}`, { cwd: REPORT_DIR, stdio: 'pipe' }); console.log(c.dim(`  Remote set: ${repoUrl}`)); }
      try { execSync('git push -u origin HEAD', { cwd: REPORT_DIR, stdio: 'pipe' }); } catch { execSync('git push -u -f origin HEAD', { cwd: REPORT_DIR, stdio: 'pipe' }); }
      console.log(c.success(`  Pushed to ${repoUrl}`));
      console.log(c.dim(`  Dashboard: https://${repoUrl.split('/').slice(-2).join('/').replace('.git','')}`));
    } else { console.log(c.warning('  No remote URL — committed locally.')); }
  } catch (err) {
    const msg = err.stderr || err.message;
    console.log(c.danger(`  Git error: ${msg.slice(0, 200)}`));
  }
  console.log('');
}

module.exports = { generateReport, syncToGitHub, REPORT_FILE, REPORT_DIR };
