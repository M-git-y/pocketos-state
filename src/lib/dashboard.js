'use strict';

const readline = require('readline');
const ui = require('./ui');
const mon = require('./monitor');

const { c, box, hBar, boxLine, boxContent, header, divider, progressBar, kv, statusDot } = ui;
const {
  ALT_ON, ALT_OFF, HIDE, SHOW, ED, CUP, EL,
  CUU, CUD, CUF, CUB,
} = ui;

// ─── Dashboard Layout ────────────────────────────────────────────────────────
// Total width ~60-65 chars, fits phone screen

function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + 'K';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + 'M';
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + 'G';
}

function formatPercent(val, max) {
  if (max === 0) return '0%';
  return Math.round(val / max * 100) + '%';
}

function renderCPU(cpu, usage) {
  const w = 60;
  let out = '';
  out += boxLine(w, 'top') + '\n';
  out += boxContent(w, ` ${c.header('CPU')}`, `${c.dim(cpu.cores + ' cores')} ${c.value('@')} ${c.accent(cpu.speed + 'MHz')} `) + '\n';
  out += boxLine(w, 'mid') + '\n';
  out += boxContent(w, c.value('  ' + progressBar(usage, 100, 30, '').trim()) + `  ${c.bold(String(usage) + '%')}`, '') + '\n';
  out += boxLine(w, 'mid') + '\n';
  out += boxContent(w, ` ${c.label('Model')} ${c.dim(cpu.model.slice(0, 40))}`, '') + '\n';
  out += boxLine(w, 'bot') + '\n';
  return out;
}

function renderMemory(mem) {
  const w = 60;
  let out = '';
  out += boxLine(w, 'top') + '\n';
  out += boxContent(w, ` ${c.header('MEMORY')}`, `${c.dim('Used')} ${c.warning(formatPercent(mem.used, mem.total))} `) + '\n';
  out += boxLine(w, 'mid') + '\n';
  out += boxContent(w, c.value('  ' + progressBar(mem.used, mem.total, 30, '').trim()) + `  ${c.bold(formatBytes(mem.used) + ' / ' + formatBytes(mem.total))}`, '') + '\n';
  out += boxLine(w, 'mid') + '\n';
  out += boxContent(w, ` ${kv('Used', formatBytes(mem.used)).trim()}  ${kv('Free', formatBytes(mem.free)).trim()}`, '') + '\n';
  out += boxContent(w, ` ${kv('Available', formatBytes(mem.available)).trim()}  ${kv('Cached', formatBytes(mem.cached)).trim()}`, '') + '\n';
  out += boxLine(w, 'bot') + '\n';
  return out;
}

function renderStorage(storage) {
  const w = 60;
  let out = '';
  out += boxLine(w, 'top') + '\n';
  out += boxContent(w, ` ${c.header('STORAGE')}`, '') + '\n';
  out += boxLine(w, 'mid') + '\n';
  for (const part of storage.slice(0, 3)) {
    const name = part.mount.replace('/storage/emulated', '/sdcard').replace('/data/data/com.termux/files/home', '~/termux').slice(0, 25);
    const pct = part.pct;
    let colorFn = c.success;
    if (pct > 85) colorFn = c.danger;
    else if (pct > 70) colorFn = c.warning;
    out += boxContent(w, ` ${c.dim(name.padEnd(14))} ${progressBar(part.used, part.total, 20, '').trim()} ${colorFn(String(pct).padStart(3) + '%')}`, '') + '\n';
    if (storage.indexOf(part) < Math.min(storage.length - 1, 2)) {
      out += boxLine(w, 'mid') + '\n';
    }
  }
  out += boxLine(w, 'bot') + '\n';
  return out;
}

function renderBattery(bat) {
  const w = 28;
  if (!bat) return '';
  let out = '';
  out += boxLine(w, 'top') + '\n';
  out += boxContent(w, ` ${c.header('BATTERY')}`, '') + '\n';
  out += boxLine(w, 'mid') + '\n';
  const icon = bat.charging ? '⚡' : '🔋';
  const colorFn = bat.level > 60 ? c.success : bat.level > 20 ? c.warning : c.danger;
  out += boxContent(w, `  ${icon} ${progressBar(bat.level, 100, 14, '').trim()} ${colorFn(String(bat.level) + '%')}`, '') + '\n';
  out += boxLine(w, 'mid') + '\n';
  out += boxContent(w, ` ${kv('Status', bat.charging ? '⚡ CHARGING' : bat.status)}`.trim(), '') + '\n';
  if (bat.temp !== null) {
    out += boxContent(w, ` ${kv('Temp', bat.temp.toFixed(1) + '°C')}`.trim(), '') + '\n';
  }
  if (bat.voltage !== null) {
    out += boxContent(w, ` ${kv('Voltage', bat.voltage.toFixed(2) + 'V')}`.trim(), '') + '\n';
  }
  out += boxLine(w, 'bot') + '\n';
  return out;
}

function renderNetwork(net) {
  const w = 28;
  let out = '';
  out += boxLine(w, 'top') + '\n';
  out += boxContent(w, ` ${c.header('NETWORK')}`, '') + '\n';
  out += boxLine(w, 'mid') + '\n';
  for (const iface of net.interfaces.slice(0, 3)) {
    out += boxContent(w, `  ${c.accent('●')} ${c.value(iface.name.padEnd(6))} ${c.dim(iface.address.padEnd(15))}`, '') + '\n';
  }
  if (net.interfaces.length === 0) {
    out += boxContent(w, `  ${c.dim('(no network interfaces)')}`, '') + '\n';
  }
  out += boxLine(w, 'bot') + '\n';
  return out;
}

function renderProcesses(procs) {
  const w = 28;
  let out = '';
  out += boxLine(w, 'top') + '\n';
  out += boxContent(w, ` ${c.header('TOP PROCESSES')}`, '') + '\n';
  out += boxLine(w, 'mid') + '\n';
  for (const proc of procs.slice(0, 6)) {
    const name = proc.name.slice(0, 15);
    out += boxContent(w, `  ${c.dim(String(proc.pid).padEnd(6))} ${c.value(name.padEnd(16))} ${formatBytes(proc.rss)}`, '') + '\n';
  }
  out += boxLine(w, 'bot') + '\n';
  return out;
}

function renderThermal(thermal) {
  if (!thermal || thermal.length === 0) return '';
  const w = 60;
  let out = '';
  out += boxLine(w, 'top') + '\n';
  out += boxContent(w, ' ' + c.header('THERMAL ZONES'), '') + '\n';
  out += boxLine(w, 'mid') + '\n';
  const zones = thermal.slice(0, 4);
  const labels = zones.map(z => z.name.slice(0, 12).padEnd(12)).join(' ');
  const temps = zones.map(z => {
    const t = z.temp;
    const colorFn = t > 60 ? c.danger : t > 40 ? c.warning : c.success;
    return colorFn((String(t.toFixed(1)) + '°C').padEnd(12));
  }).join(' ');
  out += boxContent(w, '  ' + c.dim(labels), '') + '\n';
  out += boxContent(w, '  ' + temps, '') + '\n';
  out += boxLine(w, 'bot') + '\n';
  return out;
}

function renderInfo(snap) {
  const w = 60;
  const dev = snap.device;
  let out = '';
  out += boxLine(w, 'top') + '\n';
  out += boxContent(w, ` ${c.header('DEVICE')}`, `${c.accent(dev.brand)} ${c.value(dev.model)} `) + '\n';
  out += boxLine(w, 'mid') + '\n';
  out += boxContent(w, ` ${kv('Android', dev.androidVersion).trim()} | SDk:${c.dim(dev.sdk || '?').trim()} | ${kv('Arch', dev.arch).trim()}`, '') + '\n';
  out += boxLine(w, 'mid') + '\n';
  out += boxContent(w, ` ${kv('Uptime', snap.uptime.formatted).trim()}  ${kv('Host', dev.hostname).trim()}`, '') + '\n';
  out += boxLine(w, 'bot') + '\n';
  return out;
}

// ─── Main Dashboard Render ───────────────────────────────────────────────────
function renderDashboard(snap) {
  // Get real-time usage since snapshot was taken
  const cpuUsage = mon.getCPUUsage();

  let output = '\n';
  output += c.primary('  ╔══════════════════════════════════════════════════╗') + '\n';
  output += c.primary('  ║') + c.bold('  POCKET OS DASHBOARD') + ' '.repeat(21) + c.primary('║') + '\n';
  output += c.primary('  ║') + c.dim('  Press q to quit') + ' '.repeat(32) + c.primary('║') + '\n';
  output += c.primary('  ╚══════════════════════════════════════════════════╝') + '\n\n';

  // Row 1: Full width - CPU + Device info
  output += renderCPU(snap.cpu, cpuUsage);
  output += renderMemory(snap.memory);
  output += renderStorage(snap.storage);
  output += '\n';

  // Row 2: Three columns
  output += renderInfo(snap);

  // Side-by-side panels
  const batPanel = renderBattery(snap.battery);
  const netPanel = renderNetwork(snap.network);
  const procPanel = renderProcesses(snap.processes);

  // Merge battery and network side by side
  if (batPanel || netPanel) {
    const batLines = (batPanel || '').split('\n');
    const netLines = (netPanel || '').split('\n');
    const maxLines = Math.max(batLines.length, netLines.length);
    for (let i = 0; i < maxLines; i++) {
      const b = batLines[i] || '';
      const n = netLines[i] || '';
      output += b + '  ' + n + '\n';
    }
  }

  if (procPanel) {
    output += procPanel;
  }

  if (snap.thermal && snap.thermal.length > 0) {
    output += renderThermal(snap.thermal);
  }

  output += c.dim('\n  ─── Last updated: ' + new Date().toLocaleTimeString() + ' ───\n');
  return output;
}

// ─── Run interactive dashboard ───────────────────────────────────────────────
function runDashboard(refreshMs = 2000) {
  process.stdout.write(ALT_ON + HIDE);
  process.stdout.write(ED(2));

  const snap = mon.getFullSnapshot();
  // Prime CPU usage calculator
  mon.getCPUUsage();

  const render = () => {
    const snap = mon.getFullSnapshot();
    process.stdout.write(CUP(0, 0));
    process.stdout.write(EL(2));
    process.stdout.write(renderDashboard(snap));
  };

  render();
  const interval = setInterval(render, refreshMs);

  // Handle keypress
  readline.emitKeypressEvents(process.stdin);
  if (process.stdin.isTTY) process.stdin.setRawMode(true);

  const onKey = (str, key) => {
    if ((key && key.name === 'q') || str === 'q' || str === '\x03') {
      cleanup();
    }
  };
  process.stdin.on('keypress', onKey);

  function cleanup() {
    clearInterval(interval);
    process.stdin.removeListener('keypress', onKey);
    if (process.stdin.isTTY) process.stdin.setRawMode(false);
    process.stdout.write(ALT_OFF + SHOW);
    process.stdout.write(ED(2));
    console.log(c.success('\n  Dashboard closed. See you next time!\n'));
    process.exit(0);
  }

  // Handle SIGINT
  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
}

module.exports = { runDashboard, renderDashboard };
