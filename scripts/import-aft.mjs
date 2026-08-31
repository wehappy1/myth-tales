/**
 * 导入 Ashliman Folktexts（trilogy aft.csv）
 * 用法: pnpm import:aft
 *
 * 数据来源: https://github.com/j-hagedorn/trilogy/blob/master/data/aft.csv
 * 许可: CC BY-SA 4.0
 */

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const candidates = [
  join(root, 'data/raw/aft.csv'),
  join(root, 'data/books/aft.csv'),
  join(root, 'aft.csv'),
];

const csvPath = candidates.find((p) => existsSync(p));
if (!csvPath) {
  console.error('未找到 aft.csv，请放到 data/raw/aft.csv 或 data/books/aft.csv');
  process.exit(1);
}

/**
 * 简易 CSV 解析（支持引号内换行与逗号）
 * @param {string} text
 * @returns {Record<string, string>[]}
 */
function parseCsv(text) {
  /** @type {string[][]} */
  const rows = [];
  /** @type {string[]} */
  let row = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cell += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else if (ch !== '\r') {
      cell += ch;
    }
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  if (rows.length === 0) return [];
  const headers = rows[0];
  return rows
    .slice(1)
    .filter((r) => r.some((c) => c.trim()))
    .map((r) => {
      /** @type {Record<string, string>} */
      const obj = {};
      headers.forEach((h, idx) => {
        obj[h] = r[idx] ?? '';
      });
      return obj;
    });
}

/**
 * @param {string} provenance
 */
function mapTradition(provenance) {
  const p = (provenance || '').toLowerCase();
  if (!p || p === 'na') return 'cross';
  if (p.includes('china') || p.includes('chinese')) return 'chinese';
  if (p.includes('japan')) return 'japanese';
  if (p.includes('india') || p.includes('hindu')) return 'indian';
  if (p.includes('egypt')) return 'egyptian';
  if (p.includes('greece') || p.includes('greek') || p.includes('hellenic')) return 'greek';
  if (p.includes('norse') || p.includes('iceland') || p.includes('scandinav') || p.includes('norway') || p.includes('sweden') || p.includes('denmark')) {
    return 'norse';
  }
  if (p.includes('mesopotam') || p.includes('babylon') || p.includes('sumer')) return 'mesopotamian';
  return 'cross';
}

/**
 * @param {string} text
 */
function makeSummary(text) {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= 120) return clean;
  const cut = clean.slice(0, 120);
  const stop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
  return (stop > 40 ? cut.slice(0, stop + 1) : `${cut}…`).trim();
}

/**
 * @param {Record<string, string>} row
 * @param {number} index
 */
function toStory(row, index) {
  const title = (row.tale_title || '').trim() || `Untitled Folktale ${index + 1}`;
  const content = (row.text || '').trim();
  const atu = (row.atu_id || '').trim();
  const provenance = (row.provenance || '').trim();
  const notes = (row.notes || '').trim();
  const source = (row.source || '').trim();

  const idSeed = `${atu}|${title}|${provenance}|${content.slice(0, 80)}`;
  const hash = createHash('sha1').update(idSeed).digest('hex').slice(0, 10);

  const tags = ['ashliman', 'folktale'];
  if (atu && atu !== 'NA') tags.push(`ATU-${atu}`);
  if (provenance && provenance !== 'NA') tags.push(provenance);

  return {
    id: `aft-${hash}`,
    title,
    content,
    translation: null,
    summary: makeSummary(content),
    category: 'english',
    tradition: mapTradition(provenance),
    region: provenance && provenance !== 'NA' ? provenance : null,
    source_id: 'ashliman-folktexts',
    source_text: source || "Ashliman's Folktexts",
    reference: [atu && atu !== 'NA' ? `ATU ${atu}` : null, notes && notes !== 'NA' ? notes : null]
      .filter(Boolean)
      .join(' · ') || null,
    tags: tags.join(','),
    language: 'en',
    license: 'CC BY-SA 4.0',
    external_url: 'https://www.pitt.edu/~dash/folktexts.html',
  };
}

const raw = readFileSync(csvPath, 'utf-8');
const rows = parseCsv(raw);
const stories = rows
  .map((row, index) => toStory(row, index))
  .filter((s) => s.content.length >= 40);

const importedPath = join(root, 'data/imported/stories.json');
mkdirSync(dirname(importedPath), { recursive: true });

/** @type {any[]} */
let existing = [];
if (existsSync(importedPath)) {
  existing = JSON.parse(readFileSync(importedPath, 'utf-8'));
}

const kept = existing.filter((s) => s.source_id !== 'ashliman-folktexts');
const merged = [...kept, ...stories];
writeFileSync(importedPath, `${JSON.stringify(merged, null, 2)}\n`);

console.log(`读取: ${csvPath}`);
console.log(`解析行数: ${rows.length}`);
console.log(`有效故事: ${stories.length}`);
console.log(`合并后总数: ${merged.length}（保留原有 ${kept.length} + 新增 ${stories.length}）`);
console.log(`输出: data/imported/stories.json`);
