'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const ui = require('./ui');
const { c, header, section, progressBar, kv, labeledBox } = ui;

const LOG_FILE = path.join(os.homedir(), '.pocketos-ignite.json');

// ─── Logging ─────────────────────────────────────────────────────────────────
function loadLog() {
  try {
    return JSON.parse(fs.readFileSync(LOG_FILE, 'utf8'));
  } catch (_) {
    return { records: [] };
  }
}

function saveLog(log) {
  fs.writeFileSync(LOG_FILE, JSON.stringify(log, null, 2));
}

function record(action) {
  const log = loadLog();
  log.records.push({ action, ts: Date.now() });
  // Keep last 200 entries
  if (log.records.length > 200) log.records = log.records.slice(-200);
  saveLog(log);
}

// ─── Check Status ────────────────────────────────────────────────────────────
function checkStatus() {
  const log = loadLog();
  const now = Date.now();

  const actionTypes = {
    'face-pump':    { label: '面部泵血',                    idealInterval: 4 * 3600 * 1000 },  // 4h
    'leg-raise':    { label: '直腿抬举 (膝盖康复)',          idealInterval: 6 * 3600 * 1000 },  // 6h
    'upper-cardio': { label: '上肢有氧 (心率提升)',          idealInterval: 8 * 3600 * 1000 },  // 8h
    'deep-breath':  { label: '深呼吸 (副交感激活)',          idealInterval: 3 * 3600 * 1000 },  // 3h
    'micro-walk':   { label: '微型步行 (200步以上)',         idealInterval: 2 * 3600 * 1000 },  // 2h
    'stand-stretch':{ label: '站立拉伸',                    idealInterval: 2 * 3600 * 1000 },  // 2h
    'ignition':     { label: '完整点火协议 (90秒)',         idealInterval: 8 * 3600 * 1000 },  // 8h
    'posture-fix':  { label: '姿态校正',                    idealInterval: 3 * 3600 * 1000 },  // 3h
  };

  const lastTime = {};
  for (const record of log.records) {
    lastTime[record.action] = record.ts;
  }

  const status = [];
  for (const [key, info] of Object.entries(actionTypes)) {
    const last = lastTime[key] || 0;
    const elapsed = now - last;
    const hours = Math.floor(elapsed / 3600000);
    const mins = Math.floor((elapsed % 3600000) / 60000);
    const due = elapsed > info.idealInterval;
    status.push({
      key, label: info.label,
      last, elapsed,
      hours, mins,
      due,
      idealInterval: info.idealInterval,
    });
  }

  // Sort by most overdue
  status.sort((a, b) => {
    if (a.last === 0 && b.last !== 0) return -1;
    if (b.last === 0 && a.last !== 0) return 1;
    return (b.elapsed / b.idealInterval) - (a.elapsed / a.idealInterval);
  });

  return status;
}

// ─── Quick State Capture (after ignite) ─────────────────────────────────────
function startQuickCapture(rl, done) {
  const { METRICS, quickCapture } = require('./state.js');
  const keys = ['energy', 'mood', 'body']; // 3 most important post-ignite metrics
  const values = {};
  let idx = 0;

  function ask() {
    if (idx >= keys.length) {
      const result = quickCapture('ignite', values);
      console.log('');
      if (result.shift) {
        // Show the delta
        for (const [k, delta] of Object.entries(result.shift)) {
          const m = METRICS[k];
          const arrow = delta > 0 ? '↑' : delta < 0 ? '↓' : '→';
          const color = delta > 0 ? c.success : c.danger;
          console.log(`  ${m.emoji} ${m.label}: ${color(`${arrow}${delta}`)}`);
        }
      }
      console.log(c.success('\n  ✅ 状态已记录\n'));
      done();
      return;
    }
    const key = keys[idx];
    const m = METRICS[key];
    rl.question(`  ${m.emoji} ${m.label} (1-10): `, (answer) => {
      const val = parseInt(answer);
      if (!isNaN(val) && val >= 1 && val <= 10) {
        values[key] = val;
      }
      idx++;
      ask();
    });
  }
  ask();
}

// ─── 90-Second Ignition Protocol ────────────────────────────────────────────
function runIgnition() {
  const steps = [
    { dur: 30, label: '双手快速搓热，覆脸上，闭眼，感受热量', icon: '🔥' },
    { dur: 30, label: '指腹从下巴螺旋推至太阳穴 (从里往外)', icon: '🌀' },
    { dur: 30, label: '手掌根从眉心推向发际线', icon: '🏔️' },
    { dur: 15, label: '站起来，双臂向上伸直，深呼吸 5 次', icon: '🧘' },
    { dur: 5,  label: '最后一次深吸气，踮脚尖，HOLD', icon: '⚡' },
  ];

  console.log(header('IGNITION PROTOCOL'));
  console.log(c.dim('  跟随计时器执行，完成一项后按任意键进入下一项\n'));
  console.log(c.hex('f59e0b', '  ┌──────────────────────────────────────┐'));
  console.log(c.hex('f59e0b', '  │  🚀 90 秒点火协议 — 准备启动         │'));
  console.log(c.hex('f59e0b', '  └──────────────────────────────────────┘'));
  console.log('');
  console.log(c.dim('  按 Enter 开始...'));

  const readline = require('readline');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  let stepIdx = 0;

  function runStep() {
    if (stepIdx >= steps.length) {
      console.log('');
      console.log(c.success('  ╔══════════════════════════════╗'));
      console.log(c.success('  ║  ✅  点火完成！               ║'));
      console.log(c.success('  ║  面部血流已灌注              ║'));
      console.log(c.success('  ║  心率从基线上升              ║'));
      console.log(c.success('  ║  毛孔开放，组织氧合度 ↑       ║'));
      console.log(c.success('  ╚══════════════════════════════╝'));
      console.log('');
      console.log(c.value('  现在的状态: ') + c.hex('10b981', '面部温热，呼吸深度增加，膝关节零压力'));
      console.log(c.dim('  这是你冲破死锁的第一个时间片。'));
      console.log('');

      record('ignition');
      record('face-pump');
      record('deep-breath');
      record('stand-stretch');

      // Offer state capture
      console.log(c.hex('f59e0b', '  ┌──────────────────────────────────────┐'));
      console.log(c.hex('f59e0b', '  │  捕捉此刻的状态？(y/n)                │'));
      console.log(c.hex('f59e0b', '  └──────────────────────────────────────┘'));
      rl.question('  > ', (answer) => {
        if (answer.toLowerCase().startsWith('y')) {
          // Collect quick rating for key dimensions
          const readline2 = require('readline').createInterface({
            input: process.stdin, output: process.stdout
          });
          console.log('\n' + c.dim('  快速评分 (1-10)，直接回车跳过'));
          startQuickCapture(readline2, () => { rl.close(); });
        } else {
          rl.close();
        }
      });
      return;
    }

    const step = steps[stepIdx];
    console.log('');
    console.log(c.primary(`  ╔══  STEP ${stepIdx + 1}/${steps.length}  ═══════════════════════╗`));
    console.log(c.primary(`  ║  ${step.icon}  ${step.label}  ${' '.repeat(Math.max(0, 30 - step.label.length))} ║`));
    console.log(c.primary(`  ║  ⏱  ${step.dur} 秒                          ║`));
    console.log(c.primary(`  ╚══════════════════════════════════════╝`));
    console.log('');

    // Countdown
    let remaining = step.dur;
    const timer = setInterval(() => {
      remaining--;
      process.stdout.write('\r' + ui.EL(2));
      const bar = ui.progressBar(step.dur - remaining, step.dur, 30, '⏱');
      process.stdout.write('  ' + bar);
      if (remaining <= 0) {
        clearInterval(timer);
        process.stdout.write('\r' + ui.EL(2) + c.success('  ✅ 完成！\n'));
        stepIdx++;
        setTimeout(() => {
          if (stepIdx < steps.length) {
            rl.question(c.dim('\n  按 Enter 进入下一步 > '), () => runStep());
          } else {
            runStep();
          }
        }, 500);
      }
    }, 1000);
  }

  rl.question('', () => {
    runStep();
  });
}

// ─── Show Status Dashboard ───────────────────────────────────────────────────
function showStatusDashboard() {
  const status = checkStatus();

  console.log(header('BODY WATCHDOG'));

  if (status.every(s => s.last === 0)) {
    console.log(c.dim('\n  尚无记录。运行 ') + c.primary('pos ignite') + c.dim(' 开始首次点火。\n'));
    return;
  }

  const items = status.map(s => {
    if (s.last === 0) {
      return `  ${c.warning('◌')} ${c.dim(s.label.padEnd(12))} ${c.info('尚未记录')}`;
    }
    const timeStr = s.hours > 0 ? `${s.hours}h${s.mins}m ago` : `${s.mins}m ago`;
    const statusIcon = s.due ? c.warning('⚠') : c.success('✓');
    const statusFn = s.due ? c.warning : c.success;
    return `  ${statusIcon} ${c.label(s.label.padEnd(12))} ${statusFn(timeStr)}`;
  });

  console.log(labeledBox('MICRO-HABIT STATUS', items, 60));

  // Most urgent (only from logged items that are due)
  const urgent = status.filter(s => s.due && s.last !== 0);
  if (urgent.length > 0) {
    console.log('');
    console.log(c.warning('  ╔══════════════════════════════╗'));
    console.log(c.warning('  ║  NEAREST ACTION              ║'));
    console.log(c.warning('  ╚══════════════════════════════╝'));
    console.log('');
    const top = urgent[0];
    const timeStr = top.hours > 0 ? `${top.hours}h${top.mins}m` : `${top.mins}m`;
    console.log(c.primary(`  →  ${top.label}: 已间隔 ${timeStr}（建议每 ${Math.floor(top.idealInterval/3600000)}h 一次）`));

    // Suggest specific action
    const suggestions = {
      'face-pump':    c.value('  双手搓热 → 覆脸 → 螺旋推 → 额头扫血，90 秒'),
      'leg-raise':    c.value('  坐姿直腿抬举 15 次/腿，脚尖回勾，膝盖零压力'),
      'upper-cardio': c.value('  坐姿双臂快速画圈/上下摆 2 分钟，心率拉到 110+'),
      'deep-breath':  c.value('  4-7-8 呼吸法: 吸气 4 秒 → 屏息 7 秒 → 慢呼 8 秒，做 5 次'),
      'micro-walk':   c.value('  原地踏步 200 步 + 踮脚尖 20 次'),
      'stand-stretch':c.value('  站起来，手臂上举，侧弯各 10 秒'),
      'ignition':     c.value('  运行 pos ignite 执行完整 90 秒点火协议'),
      'posture-fix':  c.value('  肩后旋 10 次 → 下巴后缩 10 次 → 骨盆前倾复位'),
    };
    if (suggestions[top.key]) {
      console.log(suggestions[top.key]);
    }
    console.log('');
  }

  // Stats
  const today = status.filter(s => {
    const todayStart = new Date().setHours(0, 0, 0, 0);
    return s.last > todayStart;
  });
  const todayCount = today.length;
  const totalRecords = loadLog().records.length;

  console.log(c.dim(`  Today: ${todayCount} categories active  |  Total actions logged: ${totalRecords}`));
  console.log('');
}

// ─── Manual Log ──────────────────────────────────────────────────────────────
function logAction(action) {
  const validTypes = {
    'face':    'face-pump',
    'leg':     'leg-raise',
    'cardio':  'upper-cardio',
    'breath':  'deep-breath',
    'walk':    'micro-walk',
    'stretch': 'stand-stretch',
    'ignite':  'ignition',
    'posture': 'posture-fix',
  };

  const key = validTypes[action.toLowerCase()];
  if (!key) {
    const list = Object.keys(validTypes).join(', ');
    console.log(c.danger(`Unknown action: ${action}`));
    console.log(c.dim(`Valid: ${list}`));
    return;
  }

  record(key);
  console.log(c.success(`✓ Logged: ${key}`));
  console.log('');
  showStatusDashboard();
}

// ─── Full Ignition Sequence ──────────────────────────────────────────────────
function runFullIgnition() {
  // Check if we should show a pre-check
  const status = checkStatus();
  const urgent = status.filter(s => s.due && s.last !== 0);

  if (urgent.length > 0) {
    console.log('');
    console.log(c.warning(`  检测到 ${urgent.length} 项超过建议间隔，首先执行最紧急的:`));
    const top = urgent[0];
    console.log(c.primary(`  → ${top.label} (${top.hours}h${top.mins}m since last)`));
    console.log('');
  }

  runIgnition();
}

module.exports = {
  runIgnition: runFullIgnition,
  showStatus:  showStatusDashboard,
  logAction,
  checkStatus,
  record,
};
