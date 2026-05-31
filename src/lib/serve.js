'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const STATE_FILE  = path.join(os.homedir(), '.pocketos-state.json');
const IGNITE_FILE = path.join(os.homedir(), '.pocketos-ignite.json');
const REPORT_DIR  = path.join(os.homedir(), 'pocketos-report');
const REPORT_HTML = path.join(REPORT_DIR, 'index.html');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.js':   'text/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.png':  'image/png',
  '.svg':  'image/svg+xml',
};

// ─── Capture Form HTML (injected into dashboard) ────────────────────────────
const CAPTURE_FORM = `
<div id="capture-section" style="background:linear-gradient(135deg, #1a1d2e, #252840); border-radius:14px; padding:20px; margin:16px 0; border:1px solid #333;">
  <div style="font-size:16px; font-weight:600; color:#94a3b8; margin-bottom:16px;">
    <span style="margin-right:6px;">📝</span>Capture State
  </div>
  <form id="state-form" style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
    ${Object.entries({
      energy:['⚡','能量','枯竭','满格'],clarity:['🧠','清醒度','混沌','锐利'],
      mood:['🌤️','心境','沉重','轻快'],body:['💪','身体感','僵硬','通畅'],
      face:['😊','面部活力','暗沉','红润'],readiness:['🚀','行动意愿','抗拒','渴望']
    }).map(([k,[emoji,label,lo,hi]])=>`
    <div style="display:flex;align-items:center;gap:8px;background:#0f1117;border-radius:8px;padding:6px 10px;">
      <span style="font-size:18px;">${emoji}</span>
      <span style="font-size:11px;color:#64748b;flex:1;">${label}</span>
      <input type="range" name="${k}" min="1" max="10" value="5"
        style="width:70px;accent-color:#00d4ff;"
        oninput="this.nextElementSibling.textContent=this.value">
      <span style="color:#00d4ff;font-weight:700;font-size:14px;width:20px;text-align:center;">5</span>
    </div>
    `).join('')}
    <div style="grid-column:1/-1;">
      <textarea name="note" placeholder="一句话感受（可选）..." rows="2"
        style="width:100%;background:#0f1117;border:none;border-radius:8px;padding:10px;color:#e2e8f0;font-family:inherit;resize:vertical;"></textarea>
    </div>
    <div style="grid-column:1/-1;display:flex;gap:8px;">
      <button type="submit" id="save-btn"
        style="flex:1;padding:12px;background:linear-gradient(135deg,#00d4ff,#6366f1);border:none;border-radius:10px;color:#fff;font-weight:700;font-size:14px;cursor:pointer;">
        💾 Save State
      </button>
      <span id="save-status" style="font-size:12px;color:#10b981;align-self:center;display:none;">✓ Saved!</span>
    </div>
  </form>
  <div id="server-status" style="margin-top:12px;font-size:11px;text-align:center;color:#64748b;"></div>
</div>
`;

// ─── State Capture JS ───────────────────────────────────────────────────────
const CAPTURE_JS = `
<script>
const API_BASE = window.location.origin;

// Check if server is running
fetch(API_BASE + '/api/ping')
  .then(r => r.json())
  .then(d => {
    document.getElementById('server-status').innerHTML = '<span style="color:#10b981;">●</span> Live server — saves directly';
  })
  .catch(() => {
    document.getElementById('server-status').innerHTML = '<span style="color:#f59e0b;">●</span> Offline mode — saves to download file';
  });

document.getElementById('state-form').addEventListener('submit', async function(e) {
  e.preventDefault();
  const fd = new FormData(this);
  const data = { metrics: {}, note: fd.get('note') || '', context: 'web' };
  ['energy','clarity','mood','body','face','readiness'].forEach(k => {
    data.metrics[k] = parseInt(fd.get(k));
  });

  try {
    const res = await fetch(API_BASE + '/api/state', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(data)
    });
    if (res.ok) {
      const btn = document.getElementById('save-btn');
      const status = document.getElementById('save-status');
      btn.textContent = '✅ Saved! Refresh page to see charts.';
      status.style.display = 'inline';
      setTimeout(() => { btn.textContent = '💾 Save State'; status.style.display = 'none'; }, 3000);
    }
  } catch(e) {
    // Offline: download JSON
    const blob = new Blob([JSON.stringify([data], null, 2)], {type: 'application/json'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'state-capture.json';
    a.click();
    document.getElementById('save-status').textContent = '📥 Downloaded! Use pos sync to re-import.';
    document.getElementById('save-status').style.display = 'inline';
  }
});
</script>
`;

// ─── Serve the dashboard ─────────────────────────────────────────────────────
function injectCapture(html) {
  // Insert capture form right after the score-grid section, before charts
  const marker = '<section>';
  const idx = html.indexOf(marker);
  if (idx === -1) {
    // Insert before </body>
    const bodyIdx = html.indexOf('</body>');
    if (bodyIdx === -1) return html;
    return html.slice(0, bodyIdx) + CAPTURE_FORM + html.slice(bodyIdx);
  }
  return html.slice(0, idx) + CAPTURE_FORM + '\n' + html.slice(idx);
}

function injectScript(html) {
  const bodyIdx = html.indexOf('</body>');
  if (bodyIdx === -1) return html + CAPTURE_JS;
  return html.slice(0, bodyIdx) + CAPTURE_JS + html.slice(bodyIdx);
}

function apiResponse(res, code, data) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify(data));
}

// ─── Start Server ─────────────────────────────────────────────────────────────
function startServer(port = 8080) {
  const ui = require('./ui');
  const { c } = ui;

  // Generate fresh report silently
  const { generateReport } = require('./report');
  generateReport(true);

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://localhost:${port}`);

    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    // API: ping
    if (url.pathname === '/api/ping') {
      apiResponse(res, 200, { ok: true, ts: Date.now() });
      return;
    }

    // API: get current state
    if (url.pathname === '/api/state' && req.method === 'GET') {
      try {
        const data = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
        apiResponse(res, 200, data);
      } catch (_) {
        apiResponse(res, 200, { entries: [] });
      }
      return;
    }

    // API: save state
    if (url.pathname === '/api/state' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        try {
          const incoming = JSON.parse(body);
          const { quickCapture } = require('./state');

          if (Array.isArray(incoming)) {
            for (const item of incoming) {
              quickCapture(item.context || 'web', item.metrics, item.note || '');
            }
          } else {
            quickCapture(incoming.context || 'web', incoming.metrics, incoming.note || '');
          }

          // Regenerate report
          try { generateReport(); } catch (_) {}

          apiResponse(res, 200, { ok: true });
        } catch (err) {
          apiResponse(res, 400, { error: err.message });
        }
      });
      return;
    }

    // Static files
    let filePath = path.join(REPORT_DIR, url.pathname === '/' ? 'index.html' : url.pathname);
    // Also serve pocketos source files for viewing
    if (!fs.existsSync(filePath) && url.pathname.startsWith('/src/')) {
      filePath = path.join(os.homedir(), 'pocketos', url.pathname.replace('/src/', ''));
    }

    const ext = path.extname(filePath);
    const mimeType = MIME[ext] || 'application/octet-stream';

    try {
      let content = fs.readFileSync(filePath);
      if (ext === '.html') {
        content = injectScript(injectCapture(content.toString()));
      }
      res.writeHead(200, { 'Content-Type': mimeType });
      res.end(content);
    } catch (_) {
      if (url.pathname === '/') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(injectScript(injectCapture('<html><body><h1>PocketOS</h1><p>Run <code>pos state</code> first to generate data.</p></body></html>')));
      } else {
        res.writeHead(404);
        res.end('Not found');
      }
    }
  });

  server.listen(port, '0.0.0.0', () => {
    const ifaces = os.networkInterfaces();
    console.log('');
    console.log(c.hex('00d4ff', '  ╔══════════════════════════════════════════╗'));
    console.log(c.hex('00d4ff', '  ║  🌐 PocketOS Server Running               ║'));
    console.log(c.hex('00d4ff', '  ╚══════════════════════════════════════════╝'));
    console.log('');
    console.log(`  ${c.success('Local:')}    ${c.bold(`http://localhost:${port}`)}`);
    for (const [name, addrs] of Object.entries(ifaces)) {
      for (const addr of addrs) {
        if (!addr.internal && addr.family === 'IPv4') {
          console.log(`  ${c.success('Network:')}  ${c.primary(`http://${addr.address}:${port}`)}`);
        }
      }
    }
    console.log('');
    console.log(c.dim('  Open the Network URL on ANY device on the same WiFi'));
    console.log(c.dim('  → View dashboard + Capture state from browser'));
    console.log(c.dim('  → Press Ctrl+C to stop'));
    console.log('');
  });

  return server;
}

module.exports = { startServer };
