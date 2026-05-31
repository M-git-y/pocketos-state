'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const ui = require('./ui');
const { c, header, section, kv, labeledBox, divider } = ui;

const STATE_FILE = path.join(os.homedir(), '.pocketos-state.json');
const STATE_VERSION = 1;

// Metrics: 1-10 scale
const METRICS = {
  energy:      { label: '能量',        emoji: '⚡', 1: '枯竭', 10: '满格' },
  clarity:     { label: '清醒度',      emoji: '🧠', 1: '混沌', 10: '锐利' },
  mood:        { label: '心境',        emoji: '🌤️', 1: '沉重', 10: '轻快' },
  body:        { label: '身体感',      emoji: '💪', 1: '僵硬', 10: '通畅' },
  face:        { label: '面部活力',    emoji: '😊', 1: '暗沉', 10: '红润' },
  readiness:   { label: '行动意愿',    emoji: '🚀', 1: '抗拒', 10: '渴望' },
};

// ─── IO ──────────────────────────────────────────────────────────────────────
function loadState() {
  try {
    const raw = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    return { version: STATE_VERSION, entries: raw.entries || [] };
  } catch (_) {
    return { version: STATE_VERSION, entries: [] };
  }
}

function saveState(data) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(data, null, 2));
}

// ─── Capture State ───────────────────────────────────────────────────────────
function captureState(context = 'manual', before = null) {
  const data = loadState();

  const entry = {
    ts: Date.now(),
    context,          // 'ignite' | 'manual' | 'morning' | 'afternoon' | 'evening'
    before,           // previous entry's 'after' values (for before/after tracking)
    metrics: {},      // filled by interactive input or direct assignment
    note: '',
  };

  return { data, entry };
}

// Simple version: capture non-interactively with provided values
function quickCapture(context, values, note = '') {
  const data = loadState();
  const lastEntry = data.entries[data.entries.length - 1];

  const entry = {
    ts: Date.now(),
    context,
    before: lastEntry ? lastEntry.metrics : null,
    metrics: values,
    note,
  };

  data.entries.push(entry);
  // Keep last 365 entries
  if (data.entries.length > 365) data.entries = data.entries.slice(-365);
  saveState(data);

  // Calculate shift if we have a before
  if (entry.before && Object.keys(entry.before).length > 0) {
    const shift = {};
    for (const key of Object.keys(entry.metrics)) {
      if (entry.before[key] !== undefined) {
        shift[key] = entry.metrics[key] - entry.before[key];
      }
    }
    return { entry, shift };
  }

  return { entry, shift: null };
}

// ─── Interactive Capture ─────────────────────────────────────────────────────
function interactiveCapture(context = 'manual') {
  const readline = require('readline');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  const { data, entry } = captureState(context);
  const metrics = {};
  const metricKeys = Object.keys(METRICS);
  let idx = 0;

  console.log(header('STATE CAPTURE'));
  console.log(c.value(`  Context: ${context.toUpperCase()}`));
  console.log(c.dim(`  对以下 6 个维度打分，1-10，直接输入数字\n`));

  function askNext() {
    if (idx >= metricKeys.length) {
      // Final: free text note
      console.log('');
      rl.question(c.dim('  一句话记录你此刻的感受（可选，直接回车跳过）> '), (note) => {
        entry.metrics = metrics;
        entry.note = note.trim();
        data.entries.push(entry);
        if (data.entries.length > 365) data.entries = data.entries.slice(-365);
        saveState(data);

        rl.close();
        showShift(entry);
        showStreak(data);
      });
      return;
    }

    const key = metricKeys[idx];
    const m = METRICS[key];

    // Show scale bar
    const scale = '1' + '─'.repeat(12) + '5' + '─'.repeat(12) + '10';
    console.log('');
    console.log(c.bold(`  ${m.emoji}  ${m.label}`));
    console.log(c.subtitle(`  ${scale}`));
    console.log(c.dim(`  ${m[1]}${' '.repeat(20)}${m[10]}`));

    rl.question(c.hex('00d4ff', '  > '), (answer) => {
      const val = parseInt(answer);
      if (isNaN(val) || val < 1 || val > 10) {
        console.log(c.warning('  请输入 1-10 的数字'));
        askNext();
        return;
      }
      metrics[key] = val;
      idx++;
      askNext();
    });
  }

  askNext();
}

// ─── Show Shift ──────────────────────────────────────────────────────────────
function showShift(entry) {
  if (!entry.before) return;

  console.log('');
  console.log(header('SHIFT DETECTED'));

  const deltas = [];
  for (const key of Object.keys(entry.metrics)) {
    if (entry.before[key] !== undefined) {
      const delta = entry.metrics[key] - entry.before[key];
      if (delta !== 0) {
        deltas.push({ key, delta, before: entry.before[key], after: entry.metrics[key] });
      }
    }
  }

  if (deltas.length === 0) {
    console.log(c.dim('  与上次状态相比无明显变化'));
    return;
  }

  // Sort by absolute delta
  deltas.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  const items = deltas.map(d => {
    const arrow = d.delta > 0 ? c.success('↑') : c.danger('↓');
    const bar = '█'.repeat(Math.min(Math.abs(d.delta), 5));
    const m = METRICS[d.key];
    return `  ${m.emoji} ${c.label(m.label.padEnd(10))} ${c.dim(String(d.before).padStart(2))} ${arrow} ${c.bold(String(d.after))}  ${d.delta > 0 ? c.success(bar) : c.danger(bar)}`;
  });

  console.log(labeledBox('STATE SHIFT MAP', items, 50));

  // Find biggest positive shift
  const positive = deltas.filter(d => d.delta > 0).sort((a, b) => b.delta - a.delta);
  if (positive.length > 0) {
    const biggest = positive[0];
    console.log(c.success(`\n  ✦ 最大正向位移: ${METRICS[biggest.key].label} +${biggest.delta}`));
  }

  const negative = deltas.filter(d => d.delta < 0).sort((a, b) => a.delta - b.delta);
  if (negative.length > 0) {
    const worst = negative[0];
    console.log(c.danger(`  ✧ 最大负向位移: ${METRICS[worst.key].label} ${worst.delta}`));
  }
}

// ─── Streak / Stats ──────────────────────────────────────────────────────────
function showStreak(data) {
  const entries = data.entries;
  if (entries.length < 2) return;

  // Today's entries
  const today = new Date().setHours(0, 0, 0, 0);
  const todayEntries = entries.filter(e => e.ts > today);

  // Average change per session
  let totalShift = 0;
  let shiftCount = 0;
  for (let i = 1; i < entries.length; i++) {
    const before = entries[i - 1].metrics;
    const after = entries[i].metrics;
    if (before && after) {
      let sessionShift = 0;
      for (const key of Object.keys(after)) {
        if (before[key] !== undefined) {
          sessionShift += after[key] - before[key];
        }
      }
      totalShift += sessionShift;
      shiftCount++;
    }
  }

  if (shiftCount > 0) {
    const avgShift = (totalShift / shiftCount).toFixed(1);
    console.log('');
    console.log(c.dim(`  总状态记录: ${entries.length}  |  今日: ${todayEntries.length}  |  平均每段位移: ${avgShift > 0 ? '+' + avgShift : avgShift}`));
  }

  // Streak: consecutive days with at least 1 entry
  const days = new Set();
  for (const e of entries) {
    days.add(new Date(e.ts).toDateString());
  }
  const sortedDays = Array.from(days).sort().reverse();
  let streak = 0;
  const oneDay = 86400000;
  for (let i = 0; i < sortedDays.length; i++) {
    const expected = new Date(Date.now() - i * oneDay).toDateString();
    if (sortedDays[i] === expected) streak++;
    else break;
  }
  if (streak > 0) {
    console.log(c.hex('f59e0b', `  🔥 连续 ${streak} 天记录状态`));
  }
  console.log('');
}

// ─── View State History ──────────────────────────────────────────────────────
function viewHistory(count = 10) {
  const data = loadState();
  const entries = data.entries.slice(-count).reverse();

  if (entries.length === 0) {
    console.log(c.dim('\n  尚无状态记录。使用 pos state 开始捕获。\n'));
    return;
  }

  console.log(header('STATE HISTORY'));

  for (const entry of entries) {
    const time = new Date(entry.ts);
    const timeStr = time.toLocaleString('zh-CN', {
      month: 'numeric', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });

    const ctxLabel = {
      'ignite': c.hex('f59e0b', 'IGN'),
      'manual': c.hex('00d4ff', 'MAN'),
      'morning': c.hex('f59e0b', 'AM '),
      'afternoon': c.hex('6366f1', 'PM '),
      'evening': c.hex('7c3aed', 'EVE'),
    }[entry.context] || c.dim(entry.context.slice(0, 3).toUpperCase());

    const scores = Object.entries(entry.metrics)
      .filter(([k]) => METRICS[k])
      .map(([k, v]) => `${METRICS[k].emoji}${String(v).padStart(2)}`)
      .join(' ');

    console.log(`  ${ctxLabel} ${c.dim(timeStr)} ${scores}`);

    if (entry.note) {
      console.log(`    ${c.dim('"')}${c.value(entry.note)}${c.dim('"')}`);
    }
  }

  // Summary stats
  if (data.entries.length >= 2) {
    console.log('');
    console.log(divider());

    const avg = {};
    const keys = Object.keys(METRICS);
    for (const k of keys) avg[k] = 0;
    let count = 0;
    for (const e of data.entries) {
      for (const k of keys) {
        if (e.metrics[k] !== undefined) avg[k] += e.metrics[k];
      }
      count++;
    }
    for (const k of keys) avg[k] = count > 0 ? (avg[k] / count).toFixed(1) : '—';

    // Latest entry
    const latest = data.entries[data.entries.length - 1];
    const first = data.entries[0];
    const trend = {};
    for (const k of keys) {
      if (first.metrics[k] !== undefined && latest.metrics[k] !== undefined) {
        trend[k] = latest.metrics[k] - first.metrics[k];
      }
    }

    const stats = keys.map(k => {
      const a = avg[k];
      const t = trend[k];
      const trendIcon = t > 0 ? c.success('↑') : t < 0 ? c.danger('↓') : '→';
      const trendStr = t !== undefined ? ` ${trendIcon}${Math.abs(t)}` : '';
      return `  ${METRICS[k].emoji} ${c.label(METRICS[k].label.padEnd(10))} avg:${c.bold(String(a))}${trendStr}`;
    });

    console.log(labeledBox('LONG-TERM TREND', stats, 50));
  }

  console.log('');
}

// ─── Quick before/after for ignite ───────────────────────────────────────────
function igniteStateCapture(beforeMetrics) {
  // If beforeMetrics is provided (from last state entry), use it
  if (beforeMetrics) {
    return { entry: null, shift: null, beforeMetrics };
  }
  // Return last metrics as "before" for next capture
  const data = loadState();
  if (data.entries.length > 0) {
    const last = data.entries[data.entries.length - 1];
    return { beforeMetrics: last.metrics };
  }
  return { beforeMetrics: null };
}

module.exports = {
  captureState,
  quickCapture,
  interactiveCapture,
  viewHistory,
  showStreak,
  showShift,
  igniteStateCapture,
  METRICS,
  loadState,
};
