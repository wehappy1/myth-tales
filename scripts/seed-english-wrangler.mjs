/**
 * 用 wrangler 把缺失的英语故事写入远程 D1（单文件 ≤80KB）
 * 用法: node scripts/seed-english-wrangler.mjs
 */
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const MAX = 80000;
const outDir = join(root, 'tmp/seed-english-missing');

function escape(v) {
  return v == null ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`;
}

function storySql(story) {
  let content = story.content ?? '';
  let sql = '';
  for (let guard = 0; guard < 8; guard += 1) {
    sql = `INSERT OR REPLACE INTO stories (id, title, content, translation, summary, category, tradition, region, source_id, source_text, reference, tags, language, license, external_url) VALUES (${[
      escape(story.id),
      escape(story.title),
      escape(content),
      escape(story.translation),
      escape(story.summary),
      escape(story.category),
      escape(story.tradition),
      escape(story.region),
      escape(story.source_id),
      escape(story.source_text),
      escape(story.reference),
      escape(story.tags),
      escape(story.language ?? 'en'),
      escape(story.license),
      escape(story.external_url),
    ].join(', ')});`;
    if (Buffer.byteLength(sql, 'utf8') <= MAX) return sql;
    content = `${content.slice(0, Math.floor(content.length * 0.8))}…`;
  }
  return sql;
}

function wrangler(args) {
  const r = spawnSync('pnpm', ['exec', 'wrangler', ...args], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  });
  return r;
}

console.log('查询远程已有英语 id…');
const listed = wrangler([
  'd1',
  'execute',
  'myth-tales-db',
  '--remote',
  '--json',
  '--command',
  "SELECT id FROM stories WHERE category='english' OR source_id='ashliman-folktexts'",
]);
if (listed.status !== 0) {
  console.error(listed.stderr || listed.stdout);
  process.exit(1);
}
const payload = JSON.parse(listed.stdout);
const existing = new Set(
  (payload?.[0]?.results ?? payload?.result?.[0]?.results ?? []).map((r) => r.id),
);
console.log(`远程已有 ${existing.size} 条`);

const stories = JSON.parse(
  readFileSync(join(root, 'data/imported/stories.json'), 'utf8'),
);
const translations = existsSync(join(root, 'data/imported/translations.json'))
  ? JSON.parse(readFileSync(join(root, 'data/imported/translations.json'), 'utf8'))
  : {};

const missing = stories.filter(
  (s) =>
    (s.category === 'english' ||
      s.source_id === 'ashliman-folktexts' ||
      (typeof s.language === 'string' && s.language.toLowerCase().startsWith('en'))) &&
    !existing.has(s.id),
);
for (const s of missing) {
  if (!s.translation && translations[s.id]) s.translation = translations[s.id];
}
console.log(`待写入 ${missing.length} 条`);

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

let batch = [];
let batchBytes = 0;
let idx = 0;
const files = [];
const flush = () => {
  if (!batch.length) return;
  idx += 1;
  const name = `${String(idx).padStart(4, '0')}.sql`;
  const path = join(outDir, name);
  writeFileSync(path, `${batch.join('\n')}\n`);
  files.push(path);
  batch = [];
  batchBytes = 0;
};

for (const story of missing) {
  const sql = storySql(story);
  const bytes = Buffer.byteLength(sql, 'utf8');
  if (batchBytes + bytes > MAX) flush();
  batch.push(sql);
  batchBytes += bytes;
}
flush();
console.log(`生成 ${files.length} 个 SQL 文件`);

let ok = 0;
let fail = 0;
for (let i = 0; i < files.length; i += 1) {
  const f = files[i];
  process.stdout.write(`上传 ${i + 1}/${files.length}… `);
  const r = wrangler(['d1', 'execute', 'myth-tales-db', '--remote', '--file', f]);
  if (r.status === 0) {
    ok += 1;
    console.log('ok');
  } else {
    fail += 1;
    console.log('FAIL');
    console.error(r.stderr || r.stdout);
  }
}

const check = wrangler([
  'd1',
  'execute',
  'myth-tales-db',
  '--remote',
  '--json',
  '--command',
  "SELECT COUNT(*) AS c FROM stories WHERE category='english'",
]);
let count = '?';
try {
  const j = JSON.parse(check.stdout);
  count = j?.[0]?.results?.[0]?.c ?? j?.result?.[0]?.results?.[0]?.c;
} catch {
  /* ignore */
}
console.log(`完成 ok=${ok} fail=${fail} 远程 english 计数=${count}`);
