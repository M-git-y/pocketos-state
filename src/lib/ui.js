'use strict';

// ─── ANSI Escape Sequences ───────────────────────────────────────────────────
const CSI = '\x1b[';
const SGR  = (n) => `${CSI}${n}m`;
const CUP  = (r,c) => `${CSI}${r};${c}H`;
const ED   = (n) => `${CSI}${n}J`;
const EL   = (n) => `${CSI}${n}K`;
const CUU  = (n) => `${CSI}${n}A`;
const CUD  = (n) => `${CSI}${n}B`;
const CUF  = (n) => `${CSI}${n}C`;
const CUB  = (n) => `${CSI}${n}D`;
const HIDE = `${CSI}?25l`;
const SHOW = `${CSI}?25h`;
const ALT_ON  = `${CSI}?1049h`;
const ALT_OFF = `${CSI}?1049l`;

// ─── Color Palette (256-color + RGB) ─────────────────────────────────────────
const palette = {
  // Core
  reset:     SGR(0),
  bold:      SGR(1),
  dim:       SGR(2),
  italic:    SGR(3),
  underline: SGR(4),
  reverse:   SGR(7),
  hidden:    SGR(8),
  strike:    SGR(9),

  // Standard 16
  black:   SGR(30), red: SGR(31), green: SGR(32), yellow: SGR(33),
  blue:    SGR(34), magenta: SGR(35), cyan: SGR(36), white: SGR(37),
  blackB:  SGR(90), redB: SGR(91), greenB: SGR(92), yellowB: SGR(93),
  blueB:   SGR(94), magentaB: SGR(95), cyanB: SGR(96), whiteB: SGR(97),

  // Hex / 24-bit
  hex: (hex) => `${CSI}38;2;${parseInt(hex.slice(0,2),16)};${parseInt(hex.slice(2,4),16)};${parseInt(hex.slice(4,6),16)}m`,
  hexBg: (hex) => `${CSI}48;2;${parseInt(hex.slice(0,2),16)};${parseInt(hex.slice(2,4),16)};${parseInt(hex.slice(4,6),16)}m`,
};

// ─── Color helpers ───────────────────────────────────────────────────────────
const c = {
  primary:   (s) => `${palette.hex('00d4ff')}${s}${palette.reset}`,
  secondary: (s) => `${palette.hex('7c3aed')}${s}${palette.reset}`,
  accent:    (s) => `${palette.hex('f59e0b')}${s}${palette.reset}`,
  success:   (s) => `${palette.hex('10b981')}${s}${palette.reset}`,
  danger:    (s) => `${palette.hex('ef4444')}${s}${palette.reset}`,
  warning:   (s) => `${palette.hex('f59e0b')}${s}${palette.reset}`,
  info:      (s) => `${palette.hex('6366f1')}${s}${palette.reset}`,
  dim:       (s) => `${palette.dim}${s}${palette.reset}`,
  bold:      (s) => `${palette.bold}${s}${palette.reset}`,
  header:    (s) => `${palette.bold}${palette.hex('e0e7ff')}${s}${palette.reset}`,
  subtitle:  (s) => `${palette.hex('94a3b8')}${s}${palette.reset}`,
  label:     (s) => `${palette.hex('94a3b8')}${s}${palette.reset}`,
  value:     (s) => `${palette.hex('e2e8f0')}${s}${palette.reset}`,
  hl:        (s) => `${palette.hex('f0e68c')}${s}${palette.reset}`,
  hex:       (color, s) => `${palette.hex(color)}${s}${palette.reset}`,
  hexBg:     (color, s) => `${palette.hexBg(color)}${s}${palette.reset}`,

  // Gradient text (single char)
  gradientAt: (i, total, colors) => {
    const t = total > 1 ? i / (total - 1) : 0;
    const idx = t * (colors.length - 1);
    const lo = Math.floor(idx);
    const hi = Math.min(lo + 1, colors.length - 1);
    const frac = idx - lo;
    const a = colors[lo], b = colors[hi];
    const r = Math.round(a[0] + (b[0] - a[0]) * frac);
    const g = Math.round(a[1] + (b[1] - a[1]) * frac);
    const bl = Math.round(a[2] + (b[2] - a[2]) * frac);
    return `${CSI}38;2;${r};${g};${bl}m`;
  },
};

// ─── Box Drawing ─────────────────────────────────────────────────────────────
const box = {
  h: '─', v: '│',
  tl: '┌', tr: '┐', bl: '└', br: '┘',
  hl: '├', hr: '┤', ht: '┬', hb: '┴',
  cross: '┼',
  // double line
  dH: '═', dV: '║',
  dTL: '╔', dTR: '╗', dBL: '╚', dBR: '╝',
};

// Draw a box top, bottom, or horizontal separator
function boxLine(width, type = 'top') {
  const map = { top: [box.tl, box.h, box.tr], mid: [box.hl, box.h, box.hr], bot: [box.bl, box.h, box.br] };
  const [l, m, r] = map[type];
  return c.subtitle(l) + c.subtitle(m.repeat(width - 2)) + c.subtitle(r);
}

function boxContent(width, left, right) {
  const gap = width - 2 - left.length - right.length;
  const mid = gap > 0 ? ' '.repeat(gap) : ' ';
  return c.subtitle(box.v) + left + mid + right + c.subtitle(box.v);
}

// Draw a labeled box
function labeledBox(title, content, width = 70) {
  const lines = [boxLine(width, 'top')];
  lines.push(boxContent(width, ` ${c.bold(title)}`, ''));
  lines.push(boxLine(width, 'mid'));
  for (const ln of content) {
    lines.push(boxContent(width, ' ' + ln, ''));
  }
  lines.push(boxLine(width, 'bot'));
  return lines.join('\n');
}

// ─── Progress Bar ────────────────────────────────────────────────────────────
function progressBar(current, total, width = 40, label = '') {
  const pct = Math.min(current / total, 1);
  const filled = Math.round(pct * width);
  const empty = width - filled;
  const bar = c.hex('00d4ff', '█'.repeat(filled)) + c.dim('░'.repeat(empty));
  const pctStr = `${Math.round(pct * 100)}%`.padStart(4);
  return `${label} ${bar} ${c.bold(pctStr)}`;
}

// Horizontal bar chart (for display)
function hBar(label, value, max, width = 30) {
  const pct = Math.min(value / Math.max(max, 1), 1);
  const filled = Math.round(pct * width);
  const empty = width - filled;
  // Color based on percentage
  let colorFn;
  if (pct > 0.8) colorFn = c.danger;
  else if (pct > 0.6) colorFn = c.warning;
  else colorFn = c.success;
  const bar = colorFn('█'.repeat(filled)) + c.dim('░'.repeat(empty));
  return ` ${label.padEnd(14)} ${bar} ${c.bold(String(value))}`;
}

// ─── Spinner ─────────────────────────────────────────────────────────────────
const spinnerFrames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

function startSpinner(text = '') {
  let i = 0;
  process.stdout.write(HIDE);
  const interval = setInterval(() => {
    process.stdout.write('\r' + EL(2) + c.primary(spinnerFrames[i]) + ' ' + text);
    i = (i + 1) % spinnerFrames.length;
  }, 80);
  return {
    stop: (finalText = '') => {
      clearInterval(interval);
      process.stdout.write('\r' + EL(2) + finalText + '\n');
      process.stdout.write(SHOW);
    },
    update: (newText) => { text = newText; }
  };
}

// ─── Screen Management ───────────────────────────────────────────────────────
function clearScreen() { process.stdout.write(ED(2) + CUP(0,0)); }
function hideCursor() { process.stdout.write(HIDE); }
function showCursor() { process.stdout.write(SHOW); }
function moveTo(r, c) { process.stdout.write(CUP(r, c)); }
function clearLine() { process.stdout.write(EL(2)); }

// ─── Text Effects ────────────────────────────────────────────────────────────
function rainbow(text) {
  const colors = [
    [255, 0, 0], [255, 127, 0], [255, 255, 0],
    [0, 255, 0], [0, 0, 255], [75, 0, 130], [143, 0, 255]
  ];
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const colIdx = Math.floor(i / text.length * colors.length);
    const [r, g, b] = colors[colIdx];
    out += `${CSI}38;2;${r};${g};${b}m${text[i]}`;
  }
  return out + palette.reset;
}

function typewriter(text, delay = 0) {
  for (let i = 0; i < text.length; i++) {
    process.stdout.write(text[i]);
    if (delay > 0) {
      const until = Date.now() + delay;
      while (Date.now() < until) {}
    }
  }
}

// ─── Layout Helpers ──────────────────────────────────────────────────────────
function header(text) {
  const t = text.toUpperCase();
  const pad = Math.max(0, Math.floor((60 - t.length) / 2));
  return '\n' + c.subtitle('═'.repeat(60)) + '\n' +
         ' '.repeat(pad) + c.header(t) + '\n' +
         c.subtitle('═'.repeat(60)) + '\n';
}

function section(text) {
  return '\n' + c.primary('▸ ') + c.bold(text) + '\n' + c.subtitle('  ' + '─'.repeat(40));
}

function listItem(icon, text) {
  return `  ${icon}  ${text}`;
}

function kv(label, value) {
  return `  ${c.label(label.padEnd(16))} ${c.value(value)}`;
}

function statusDot(ok, label) {
  const dot = ok ? c.success('●') : c.danger('●');
  return `  ${dot} ${label}`;
}

// ─── Big ASCII Art ───────────────────────────────────────────────────────────
const banner = `
${c.primary('  ██████╗   ██████╗   ██╗  ██╗ ███████╗ ████████╗')}
${c.primary('  ██╔══██╗ ██╔═══██╗ ██║  ██║ ██╔════╝ ╚══██╔══╝')}
${c.primary('  ██████╔╝ ██║   ██║ ███████║ █████╗     ██║   ')}
${c.primary('  ██╔═══╝  ██║   ██║ ██╔══██║ ██╔══╝     ██║   ')}
${c.primary('  ██║      ╚██████╔╝ ██║  ██║ ███████╗   ██║   ')}
${c.primary('  ╚═╝       ╚═════╝  ╚═╝  ╚═╝ ╚══════╝   ╚═╝   ')}
${c.subtitle('       Mobile Terminal Productivity Suite v1.0')}
${c.dim('       ─────────────────────────────────────')}
`;

// ─── Divider ─────────────────────────────────────────────────────────────────
function divider(char = '─', width = 60) {
  return c.subtitle(char.repeat(width));
}

// ─── Table ───────────────────────────────────────────────────────────────────
function table(headers, rows, colWidths) {
  // Auto-width if not specified
  if (!colWidths) {
    colWidths = headers.map((h, i) => {
      let max = h.length;
      for (const row of rows) max = Math.max(max, String(row[i] || '').length);
      return max + 2;
    });
  }
  const totalW = colWidths.reduce((a, b) => a + b, 0) + 1;

  const sep = c.subtitle('├' + colWidths.map(w => '─'.repeat(w)).join('┼') + '┤');
  const top = c.subtitle('┌' + colWidths.map(w => '─'.repeat(w)).join('┬') + '┐');
  const bot = c.subtitle('└' + colWidths.map(w => '─'.repeat(w)).join('┴') + '┘');

  const hdr = c.subtitle('│') + headers.map((h, i) =>
    c.bold(h.padEnd(colWidths[i] - 1)) + ' ' + c.subtitle('│')
  ).join('');

  const dataRows = rows.map(row =>
    c.subtitle('│') + row.map((cell, i) =>
      ' ' + c.value(String(cell || '').padEnd(colWidths[i] - 1)) + c.subtitle('│')
    ).join('')
  );

  return [top, hdr, sep, ...dataRows, bot].join('\n');
}

// ─── Exports ─────────────────────────────────────────────────────────────────
module.exports = {
  CSI, SGR, CUP, ED, EL, CUU, CUD, CUF, CUB,
  HIDE, SHOW, ALT_ON, ALT_OFF,
  palette, c, box,
  boxLine, boxContent, labeledBox,
  progressBar, hBar,
  startSpinner, spinnerFrames,
  clearScreen, hideCursor, showCursor, moveTo, clearLine,
  rainbow, typewriter,
  header, section, listItem, kv, statusDot,
  banner, divider, table,
};
