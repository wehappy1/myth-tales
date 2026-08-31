/**
 * 生成本地 D1 seed SQL（开发用）
 * 用法: node scripts/seed-local.mjs > seed-data.sql
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

// 若 data/books/ 有文件，先执行导入
spawnSync(process.execPath, [join(__dirname, 'import-books.mjs')], {
  cwd: root,
  stdio: 'inherit',
});

const stories = JSON.parse(
  readFileSync(join(root, 'data/imported/stories.json'), 'utf-8'),
);
const translationsPath = join(root, 'data/imported/translations.json');
const translations = existsSync(translationsPath)
  ? JSON.parse(readFileSync(translationsPath, 'utf-8'))
  : {};
for (const story of stories) {
  if (!story.translation && translations[story.id]) {
    story.translation = translations[story.id];
  }
}
const sources = JSON.parse(
  readFileSync(join(root, 'data/sources.json'), 'utf-8'),
);

// 自动补齐故事里出现、但 sources.json 未登记的 source_id
const known = new Set(sources.map((s) => s.id));
for (const story of stories) {
  const id = story.source_id;
  if (!id || known.has(id)) continue;
  known.add(id);
  sources.push({
    id,
    name: id,
    url: null,
    license: story.license ?? null,
    language: story.language ?? 'zh',
    description: `自动补齐：来自导入故事 ${story.source_text ?? id}`,
  });
}

const escape = (v) => (v == null ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`);

const lines = ['PRAGMA foreign_keys = OFF;', 'BEGIN TRANSACTION;'];

for (const s of sources) {
  lines.push(
    `INSERT OR REPLACE INTO sources (id, name, url, license, language, description) VALUES (${[
      escape(s.id),
      escape(s.name),
      escape(s.url),
      escape(s.license),
      escape(s.language),
      escape(s.description),
    ].join(', ')});`,
  );
}

for (const story of stories) {
  lines.push(
    `INSERT OR REPLACE INTO stories (id, title, content, translation, summary, category, tradition, region, source_id, source_text, reference, tags, language, license, external_url) VALUES (${[
      escape(story.id),
      escape(story.title),
      escape(story.content),
      escape(story.translation),
      escape(story.summary),
      escape(story.category),
      escape(story.tradition),
      escape(story.region),
      escape(story.source_id),
      escape(story.source_text),
      escape(story.reference),
      escape(story.tags),
      escape(story.language),
      escape(story.license),
      escape(story.external_url),
    ].join(', ')});`,
  );
}

lines.push('COMMIT;');
lines.push('PRAGMA foreign_keys = ON;');

const output = lines.join('\n');
writeFileSync(join(root, 'seed-data.sql'), output);
console.log(`Wrote seed-data.sql (${stories.length} stories, ${sources.length} sources)`);
