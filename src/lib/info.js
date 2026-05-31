'use strict';

const os = require('os');
const mon = require('./monitor');
const ui = require('./ui');
const { c, header, section, kv, statusDot, listItem, divider, labeledBox } = ui;

function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}

function showInfo() {
  console.log(header('DEVICE REPORT'));

  const dev = mon.getDevice();
  const cpu = mon.getCPUInfo();
  const mem = mon.getMemory();
  const storage = mon.getStorage();
  const net = mon.getNetwork();
  const bat = mon.getBattery();
  const uptime = mon.getUptime();

  // Device
  console.log(labeledBox('DEVICE', [
    kv('Brand', dev.brand),
    kv('Model', dev.model),
    kv('Android', dev.androidVersion + ' (SDK ' + (dev.sdk || '?') + ')'),
    kv('Architecture', dev.arch),
    kv('Hostname', dev.hostname),
  ], 60));

  console.log('');
  console.log(labeledBox('SYSTEM', [
    kv('CPU', cpu.model),
    kv('Cores', String(cpu.cores)),
    kv('Uptime', uptime.formatted),
    kv('Platform', dev.platform + ' ' + os.release()),
    kv('Node.js', process.version),
  ], 60));

  console.log('');
  console.log(labeledBox('MEMORY', [
    listItem(c.primary('▸'), `Total:  ${c.bold(formatBytes(mem.total))}`),
    listItem(c.warning('▸'), `Used:   ${formatBytes(mem.used)} (${mem.usagePct}%)`),
    listItem(c.success('▸'), `Free:   ${formatBytes(mem.free)}`),
    listItem(c.info('▸'), `Avail:  ${formatBytes(mem.available)}`),
  ], 60));

  console.log('');
  console.log(labeledBox('STORAGE', storage.map(s => {
    return listItem(s.pct > 85 ? c.danger('▸') : c.success('▸'),
      `${s.mount}: ${formatBytes(s.used)} / ${formatBytes(s.total)} (${s.pct}%)`);
  }), 60));

  if (bat) {
    console.log('');
    const batIcon = bat.charging ? '⚡ Charging' : bat.status;
    console.log(labeledBox('BATTERY', [
      listItem(c.accent('▸'), `Level:    ${bat.level}%`),
      listItem(c.info('▸'), `Status:   ${batIcon}`),
      bat.temp !== null ? listItem(c.info('▸'), `Temp:     ${bat.temp.toFixed(1)}°C`) : null,
      bat.voltage !== null ? listItem(c.info('▸'), `Voltage:  ${bat.voltage.toFixed(2)}V`) : null,
    ].filter(Boolean), 60));
  }

  if (net.interfaces.length > 0) {
    console.log('');
    console.log(labeledBox('NETWORK', net.interfaces.map(iface => {
      return listItem(c.primary('▸'), `${iface.name}: ${iface.address} (${iface.family})`);
    }), 60));
  }

  console.log('\n');
}

async function showScan(rootPaths = []) {
  if (rootPaths.length === 0) {
    rootPaths = [os.homedir()];
    // On Android try to include shared storage
    try {
      const { execSync } = require('child_process');
      const sdcard = execSync('echo /storage/emulated/0 2>/dev/null', { encoding: 'utf8' }).trim();
      if (sdcard) rootPaths.push(sdcard);
    } catch {}
  }

  console.log(header('FILE SYSTEM SCAN'));
  console.log(c.dim(`  Scanning: ${rootPaths.join(', ')}\n`));

  const scanner = require('./scanner');
  const spinner = ui.startSpinner('Scanning files...');

  const result = await scanner.scan(rootPaths, (n, file, phase) => {
    if (phase) {
      spinner.update(`Phase 1: found ${n} files`);
    } else {
      spinner.update(`Checking duplicates: ${n} hashed`);
    }
  });

  spinner.stop(c.success('✓ Scan complete!') + c.dim(`  ${result.totalFiles} files, ${scanner.formatSize(result.totalSize)} total`));

  // Categories
  console.log('');
  console.log(labeledBox('FILE TYPE DISTRIBUTION', result.categoryStats.map(([cat, stats]) => {
    const bar = '█'.repeat(Math.round(stats.size / result.totalSize * 30));
    return `  ${c.label(cat.padEnd(12))} ${c.value(bar)} ${c.bold(String(stats.count))} files (${scanner.formatSize(stats.size)})`;
  }), 60));

  // Large files
  if (result.largeFiles.length > 0) {
    console.log('');
    console.log(labeledBox('LARGE FILES (>50MB)', result.largeFiles.slice(0, 10).map(f => {
      const name = f.path.replace(os.homedir(), '~').slice(0, 45);
      return `  ${c.warning('▸')} ${scanner.formatSize(f.size).padStart(8)} ${c.dim(name)}`;
    }), 60));
  }

  // Duplicates
  if (result.duplicateGroups.length > 0) {
    console.log('');
    console.log(labeledBox(`DUPLICATE FILES (${scanner.formatSize(result.totalDuplicates)} wasted)`, result.duplicateGroups.slice(0, 8).map(group => {
      const name = group[0].name.slice(0, 25);
      const count = group.length;
      const waste = (count - 1) * group[0].size;
      return `  ${c.danger('▸')} ${c.bold(name)} ${c.dim(`×${count} copies`)} ${c.warning(`wastes ${scanner.formatSize(waste)}`)}`;
    }), 60));
  } else {
    console.log(`\n  ${c.success('✓')} No duplicate files found.`);
  }

  // Old files
  if (result.oldFiles.length > 0) {
    console.log('');
    console.log(labeledBox('OLD FILES (>90 days untouched)', result.oldFiles.slice(0, 10).map(f => {
      const name = f.path.replace(os.homedir(), '~').slice(0, 40);
      return `  ${c.dim('▸')} ${scanner.formatSize(f.size).padStart(8)} ${name}  ${c.dim(scanner.timeAgo(f.mtime))}`;
    }), 60));
  }

  console.log('\n');
}

module.exports = { showInfo, showScan };
