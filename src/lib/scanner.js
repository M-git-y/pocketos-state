'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ─── Config ──────────────────────────────────────────────────────────────────
const SKIP_DIRS = new Set([
  'proc', 'sys', 'dev', 'run', 'tmp', 'cache',
  'system', 'vendor', 'product', 'apex', 'metadata',
  'lost+found', '.git', 'node_modules', '__pycache__',
  '.thumbnails', '.cache', '.npm', '.gradle',
]);
const SKIP_PREFIXES = ['.', '/proc/', '/sys/', '/dev/', '/data/dalvik-cache/'];
const LARGE_FILE_THRESHOLD = 50 * 1024 * 1024; // 50MB
const PARTIAL_HASH_SIZE = 4096; // first 4KB for quick compare
const MAX_FILES_TO_SCAN = 50000; // safety limit

// ─── File Type Categorization ────────────────────────────────────────────────
const FILE_CATEGORIES = {
  'Images':    /\.(jpg|jpeg|png|gif|bmp|webp|heic|heif|svg|ico|tiff?|raw)$/i,
  'Videos':    /\.(mp4|mkv|avi|mov|wmv|flv|webm|3gp|m4v|ts|m2ts)$/i,
  'Audio':     /\.(mp3|wav|flac|aac|ogg|wma|m4a|opus|ape)$/i,
  'Documents': /\.(pdf|docx?|xlsx?|pptx?|txt|md|rst|csv|json|xml|yaml|yml|toml|ini|cfg|conf|log)$/i,
  'Archives':  /\.(zip|tar|gz|bz2|xz|7z|rar|tgz|tbz|txz)$/i,
  'Code':      /\.(js|ts|jsx|tsx|py|rb|java|kt|swift|c|cpp|h|hpp|go|rs|sh|bash|zsh|fish|php|sql|r|lua|pl|scala|dart)$/i,
  'APKs':      /\.(apk|aab|xapk|apkm)$/i,
  'Databases': /\.(db|sqlite|sqlite3|db3)$/i,
  'Fonts':     /\.(ttf|otf|woff2?|eot)$/i,
};

function categorizeFile(filename) {
  for (const [cat, re] of Object.entries(FILE_CATEGORIES)) {
    if (re.test(filename)) return cat;
  }
  return 'Other';
}

// ─── Format Size ─────────────────────────────────────────────────────────────
function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}

// ─── Should skip path ────────────────────────────────────────────────────────
function shouldSkip(abspath) {
  for (const prefix of SKIP_PREFIXES) {
    if (abspath.startsWith(prefix)) return true;
  }
  const basename = path.basename(abspath);
  return SKIP_DIRS.has(basename);
}

// ─── Quick Hash (first 4KB) ─────────────────────────────────────────────────
function quickHash(filepath) {
  try {
    const fd = fs.openSync(filepath, 'r');
    const buf = Buffer.alloc(PARTIAL_HASH_SIZE);
    const n = fs.readSync(fd, buf, 0, PARTIAL_HASH_SIZE, 0);
    fs.closeSync(fd);
    return crypto.createHash('md5').update(buf.slice(0, n)).digest('hex');
  } catch {
    return null;
  }
}

// ─── Full Hash ───────────────────────────────────────────────────────────────
function fullHash(filepath) {
  return new Promise((resolve) => {
    try {
      const hash = crypto.createHash('md5');
      const stream = fs.createReadStream(filepath, { highWaterMark: 64 * 1024 });
      stream.on('data', (chunk) => hash.update(chunk));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', () => resolve(null));
    } catch {
      resolve(null);
    }
  });
}

// ─── Directory Size ──────────────────────────────────────────────────────────
function dirSize(dirPath, maxDepth = 2) {
  let total = 0;
  const children = [];
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dirPath, entry.name);
      try {
        if (entry.isDirectory() && maxDepth > 0 && !shouldSkip(full)) {
          const sub = dirSize(full, maxDepth - 1);
          total += sub.total;
          if (sub.children.length > 0) children.push(...sub.children);
          children.push({ name: full, size: sub.total, isDir: true });
        } else if (entry.isFile()) {
          const stat = fs.statSync(full);
          total += stat.size;
        }
      } catch {}
    }
  } catch {}
  return { total, children };
}

// ─── Main Scan Function ──────────────────────────────────────────────────────
async function scan(rootDirs, onProgress = null) {
  // Phase 1: Collect all files
  const allFiles = [];
  const categoryStats = {}; // { category: { count, size } }
  const dirSizes = [];
  let totalScanned = 0;

  function collectDir(dirPath, depth, root) {
    if (depth > 5) return; // Don't go too deep
    if (shouldSkip(dirPath)) return;
    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      for (const entry of entries) {
        if (totalScanned >= MAX_FILES_TO_SCAN) return;
        const full = path.join(dirPath, entry.name);
        const basename = entry.name;

        if (entry.isDirectory()) {
          if (SKIP_DIRS.has(basename) || basename.startsWith('.')) continue;
          collectDir(full, depth + 1, root);
        } else if (entry.isFile()) {
          try {
            const stat = fs.statSync(full);
            totalScanned++;
            const cat = categorizeFile(basename);
            if (!categoryStats[cat]) categoryStats[cat] = { count: 0, size: 0 };
            categoryStats[cat].count++;
            categoryStats[cat].size += stat.size;

            const file = {
              path: full,
              name: basename,
              size: stat.size,
              mtime: stat.mtimeMs,
              category: cat,
            };
            allFiles.push(file);

            if (onProgress && totalScanned % 200 === 0) {
              onProgress(totalScanned, file);
            }
          } catch {}
        }
      }
    } catch {}
  }

  // Collect directory sizes for top-level
  for (const root of rootDirs) {
    try {
      const entries = fs.readdirSync(root, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory() && !SKIP_DIRS.has(entry.name) && !entry.name.startsWith('.')) {
          const full = path.join(root, entry.name);
          const sizeInfo = dirSize(full, 2);
          if (sizeInfo.total > 0) {
            dirSizes.push({ name: entry.name, path: full, size: sizeInfo.total });
          }
        }
      }
    } catch {}
  }

  // Collect files
  for (const root of rootDirs) {
    collectDir(root, 0, root);
  }
  if (onProgress) onProgress(totalScanned, null, true); // phase 1 done

  // Phase 2: Find large files
  const largeFiles = allFiles
    .filter(f => f.size > LARGE_FILE_THRESHOLD)
    .sort((a, b) => b.size - a.size)
    .slice(0, 30);

  // Phase 3: Find duplicates
  const sizeGroups = {};
  for (const f of allFiles) {
    if (f.size < 1024) continue; // skip tiny files
    if (!sizeGroups[f.size]) sizeGroups[f.size] = [];
    sizeGroups[f.size].push(f);
  }

  // Only check groups with >1 file of same size
  const candidateGroups = Object.values(sizeGroups).filter(g => g.length > 1);

  // Hash each candidate
  const hashMap = {}; // quickHash -> [{path, file}]
  let dupChecked = 0;
  for (const group of candidateGroups) {
    for (const file of group) {
      const qh = quickHash(file.path);
      if (!qh) continue;
      if (!hashMap[qh]) hashMap[qh] = [];
      hashMap[qh].push(file);
      dupChecked++;
      if (onProgress && dupChecked % 50 === 0) {
        onProgress(dupChecked, null, false, 'hash');
      }
    }
  }

  // Groups with same quick hash, full hash verify
  const dupGroups = [];
  const quickHashGroups = Object.values(hashMap).filter(g => g.length > 1);
  let verified = 0;
  for (const group of quickHashGroups) {
    const fullHashMap = {};
    for (const file of group) {
      const fh = await fullHash(file.path);
      if (!fh) continue;
      if (!fullHashMap[fh]) fullHashMap[fh] = [];
      fullHashMap[fh].push(file);
    }
    const confirmed = Object.values(fullHashMap).filter(g => g.length > 1);
    for (const c of confirmed) dupGroups.push(c);
    verified++;
  }

  // Sort and limit dup groups
  dupGroups.sort((a, b) => b[0].size - a[0].size);

  // Phase 4: Old/unused files (>90 days)
  const now = Date.now();
  const ninetyDays = 90 * 86400 * 1000;
  const oldFiles = allFiles
    .filter(f => now - f.mtime > ninetyDays)
    .sort((a, b) => b.size - a.size)
    .slice(0, 30);

  // Category stats sorted
  const categoryList = Object.entries(categoryStats)
    .sort((a, b) => b[1].size - a[1].size);

  return {
    totalFiles: allFiles.length,
    totalSize: allFiles.reduce((s, f) => s + f.size, 0),
    categoryStats: categoryList,
    largeFiles,
    duplicateGroups: dupGroups.slice(0, 20),
    totalDuplicates: dupGroups.reduce((s, g) => s + (g.length - 1) * g[0].size, 0),
    oldFiles,
    dirSizes: dirSizes.sort((a, b) => b.size - a.size),
  };
}

// Format time ago
function timeAgo(ms) {
  const diff = Date.now() - ms;
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 365) return `${days}d ago`;
  return `${Math.floor(days / 365)}y ago`;
}

module.exports = { scan, formatSize, timeAgo, categorizeFile, LARGE_FILE_THRESHOLD };
