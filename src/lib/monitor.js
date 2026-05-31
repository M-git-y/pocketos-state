'use strict';

const fs = require('fs');
const os = require('os');
const { execSync } = require('child_process');

// ─── CPU Info ────────────────────────────────────────────────────────────────
function getCPU() {
  const cpus = os.cpus();
  let totalIdle = 0, totalTick = 0;
  for (const cpu of cpus) {
    for (const type in cpu.times) totalTick += cpu.times[type];
    totalIdle += cpu.times.idle;
  }
  return {
    model: cpus[0]?.model || 'Unknown',
    cores: cpus.length,
    speed: cpus[0]?.speed || 0,
    usage: Math.round((1 - totalIdle / totalTick) * 100),
    idle: Math.round((totalIdle / totalTick) * 100),
  };
}

// Re-read CPU for delta calculation (usage % over time)
let _prevIdle = 0, _prevTotal = 0;
function getCPUUsage() {
  const cpus = os.cpus();
  let idle = 0, total = 0;
  for (const cpu of cpus) {
    for (const type in cpu.times) total += cpu.times[type];
    idle += cpu.times.idle;
  }
  const deltaIdle = idle - _prevIdle;
  const deltaTotal = total - _prevTotal;
  _prevIdle = idle; _prevTotal = total;
  if (deltaTotal === 0) return 0;
  return Math.round((1 - deltaIdle / deltaTotal) * 100);
}

function getCPUInfo() {
  let model = '';
  let cores = os.cpus().length;
  try {
    const info = fs.readFileSync('/proc/cpuinfo', 'utf8');
    const match = info.match(/model name\s*:\s*(.+)/) ||
                  info.match(/Hardware\s*:\s*(.+)/);
    if (match) model = match[1].trim();
    // Count processor entries as fallback (Android doesn't always expose siblings)
    const processorCount = (info.match(/processor\s*:\s*\d+/g) || []).length;
    if (processorCount > 0) cores = processorCount;
    // siblings takes priority if available
    const siblings = info.match(/siblings\s*:\s*(\d+)/);
    if (siblings) cores = parseInt(siblings[1]);
    // Android: "CPU variant", "CPU part", "CPU implementer"
    if (!model) {
      const impl = info.match(/CPU implementer\s*:\s*(.+)/);
      const part = info.match(/CPU part\s*:\s*(.+)/);
      const var_ = info.match(/CPU variant\s*:\s*(.+)/);
      if (impl) model = `ARM (impl:${impl[1].trim()} part:${(part||['','?'])[1].trim()} var:${(var_||['','?'])[1].trim()})`;
    }
  } catch (_) {}
  if (!model) model = os.cpus()[0]?.model || 'Unknown';
  return { model, cores };
}

// ─── Memory Info ─────────────────────────────────────────────────────────────
function getMemory() {
  let total = os.totalmem(), free = os.freemem();
  let cached = 0, buffers = 0;
  try {
    const meminfo = fs.readFileSync('/proc/meminfo', 'utf8');
    const get = (k) => {
      const m = meminfo.match(new RegExp(k + ':\\s*(\\d+)'));
      return m ? parseInt(m[1]) * 1024 : 0;
    };
    total = get('MemTotal');
    free = get('MemFree');
    cached = get('Cached') + get('SReclaimable');
    buffers = get('Buffers');
  } catch (_) {}

  const used = total - free;
  const available = free + cached + buffers;
  return {
    total, used, free, cached, buffers, available,
    usagePct: Math.round((used / total) * 100),
    barFrac: used / total,
  };
}

// ─── Storage Info ────────────────────────────────────────────────────────────
function getStorage() {
  const parts = [];
  try {
    const df = execSync('df -k / /storage/emulated /data 2>/dev/null', { encoding: 'utf8' });
    const lines = df.trim().split('\n').slice(1);
    for (const line of lines) {
      const parts_ = line.trim().split(/\s+/);
      if (parts_.length >= 6) {
        const total = parseInt(parts_[1]) * 1024;
        const used = parseInt(parts_[2]) * 1024;
        const avail = parseInt(parts_[3]) * 1024;
        const pct = parts_[4].replace('%','');
        parts.push({ mount: parts_[5], total, used, avail, pct: parseInt(pct) });
      }
    }
  } catch (_) {}
  // Fallback: use /proc/mounts or just show home
  if (parts.length === 0) {
    try {
      const stat = fs.statfsSync(os.homedir());
      const total = stat.blocks * stat.bsize;
      const free = stat.bfree * stat.bsize;
      parts.push({
        mount: os.homedir(),
        total,
        used: total - free,
        avail: free,
        pct: Math.round((1 - free/total) * 100),
      });
    } catch (_) {}
  }
  return parts;
}

// ─── Network Info ────────────────────────────────────────────────────────────
function getNetwork() {
  const interfaces = os.networkInterfaces();
  const list = [];
  for (const [name, addrs] of Object.entries(interfaces)) {
    for (const addr of addrs) {
      if (!addr.internal) {
        list.push({ name, address: addr.address, family: addr.family, mac: addr.mac });
      }
    }
  }
  // Get current data usage from /proc
  let rx = 0, tx = 0;
  try {
    const netdev = fs.readFileSync('/proc/net/dev', 'utf8');
    const lines = netdev.split('\n').slice(2);
    for (const line of lines) {
      const fields = line.trim().split(/\s+/);
      if (fields[0] && fields[0] !== 'lo:' && !fields[0].endsWith(':')) continue;
      if (fields[0] === 'lo:' || fields.length < 10) continue;
      rx += parseInt(fields[1]) || 0;
      tx += parseInt(fields[9]) || 0;
    }
  } catch (_) {}
  return { interfaces: list, rx, tx };
}

// ─── Battery Info (Android) ──────────────────────────────────────────────────
function getBattery() {
  try {
    const cap = fs.readFileSync('/sys/class/power_supply/battery/capacity', 'utf8').trim();
    const status = fs.readFileSync('/sys/class/power_supply/battery/status', 'utf8').trim();
    let temp = null, voltage = null, current = null;
    try { temp = fs.readFileSync('/sys/class/power_supply/battery/temp', 'utf8').trim(); } catch (_) {}
    try { voltage = fs.readFileSync('/sys/class/power_supply/battery/voltage_now', 'utf8').trim(); } catch (_) {}
    try { current = fs.readFileSync('/sys/class/power_supply/battery/current_now', 'utf8').trim(); } catch (_) {}
    return {
      level: parseInt(cap),
      charging: status === 'Charging' || status === 'Full',
      status,
      temp: temp ? (parseInt(temp) / 10) : null,
      voltage: voltage ? (parseInt(voltage) / 1000000) : null,
      current: current ? (parseInt(current) / 1000) : null,
    };
  } catch (_) {
    return null;
  }
}

// ─── Thermal Info ────────────────────────────────────────────────────────────
function getThermal() {
  const zones = [];
  try {
    const dir = '/sys/class/thermal/';
    const entries = fs.readdirSync(dir);
    for (const entry of entries) {
      if (!entry.startsWith('thermal_zone')) continue;
      try {
        const type = fs.readFileSync(dir + entry + '/type', 'utf8').trim();
        const temp = parseInt(fs.readFileSync(dir + entry + '/temp', 'utf8').trim());
        zones.push({ name: type, temp: temp / 1000 });
      } catch (_) {}
    }
  } catch (_) {}
  return zones;
}

// ─── Process List ────────────────────────────────────────────────────────────
function getProcesses(count = 10) {
  const procs = [];
  try {
    const output = execSync(`ps -eo pid,rss,comm --sort=-rss 2>/dev/null | head -${count + 1}`, { encoding: 'utf8' });
    const lines = output.trim().split('\n').slice(1);
    for (const line of lines) {
      const m = line.trim().match(/^(\d+)\s+(\d+)\s+(.+)/);
      if (m) procs.push({ pid: parseInt(m[1]), rss: parseInt(m[2]) * 1024, name: m[3].slice(0, 25) });
    }
  } catch (_) {}
  return procs;
}

// ─── Uptime ──────────────────────────────────────────────────────────────────
function getUptime() {
  const uptime = os.uptime();
  const days = Math.floor(uptime / 86400);
  const hours = Math.floor((uptime % 86400) / 3600);
  const mins = Math.floor((uptime % 3600) / 60);
  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  parts.push(`${mins}m`);
  return { seconds: uptime, formatted: parts.join(' ') };
}

// ─── Device Info ─────────────────────────────────────────────────────────────
function getDevice() {
  let model = '', brand = '', sdk = '';

  // Method 1: /system/build.prop (root or accessible)
  try {
    const build = fs.readFileSync('/system/build.prop', 'utf8');
    const get = (k) => {
      const m = build.match(new RegExp(k + '=(.+)'));
      return m ? m[1].trim() : '';
    };
    model = get('ro.product.model') || get('ro.product.name');
    brand = get('ro.product.brand') || get('ro.product.manufacturer');
    sdk = get('ro.build.version.sdk');
  } catch (_) {}

  // Method 2: getprop command (Android)
  if (!model) {
    try {
      const { execSync } = require('child_process');
      model = execSync('getprop ro.product.model 2>/dev/null', { encoding: 'utf8' }).trim();
      brand = execSync('getprop ro.product.brand 2>/dev/null', { encoding: 'utf8' }).trim();
    } catch (_) {}
  }

  // Method 3: /proc/cpuinfo for SoC info
  if (!model) {
    try {
      const cpuinfo = fs.readFileSync('/proc/cpuinfo', 'utf8');
      const hw = cpuinfo.match(/Hardware\s*:\s*(.+)/);
      if (hw) model = hw[1].trim();
    } catch (_) {}
  }

  if (!model) model = 'Unknown';
  if (!brand) brand = 'Unknown';

  // Get Android version from getprop
  let androidVersion = os.release ? os.release().split('.').slice(0,2).join('.') : 'N/A';
  if (!sdk) {
    try {
      const { execSync } = require('child_process');
      sdk = execSync('getprop ro.build.version.sdk 2>/dev/null', { encoding: 'utf8' }).trim();
      const rel = execSync('getprop ro.build.version.release 2>/dev/null', { encoding: 'utf8' }).trim();
      if (rel) androidVersion = rel;
    } catch (_) {}
  }

  return {
    model, brand,
    androidVersion,
    sdk,
    arch: os.arch(),
    hostname: os.hostname(),
    platform: os.platform(),
  };
}

// ─── Full System Snapshot ────────────────────────────────────────────────────
function getFullSnapshot() {
  return {
    device: getDevice(),
    cpu: getCPU(),
    cpuInfo: getCPUInfo(),
    memory: getMemory(),
    storage: getStorage(),
    network: getNetwork(),
    battery: getBattery(),
    thermal: getThermal(),
    processes: getProcesses(),
    uptime: getUptime(),
    timestamp: Date.now(),
  };
}

module.exports = {
  getCPU, getCPUUsage, getCPUInfo,
  getMemory, getStorage, getNetwork,
  getBattery, getThermal, getProcesses,
  getUptime, getDevice,
  getFullSnapshot,
};
