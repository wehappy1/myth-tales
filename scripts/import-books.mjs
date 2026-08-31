/**
 * 从 data/books/*.json 导入古籍故事
 * 用法: pnpm import:books
 *
 * 格式兼容: https://github.com/hanzhaodeng/chinese-ancient-text
 */

import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';
import {
  bookNameFromFile,
  parseBookFile,
} from './lib/book-import-utils.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const booksDir = join(root, 'data/books');
const outputPath = join(root, 'data/imported/stories.json');
const metaPath = join(booksDir, '_meta.json');

/** @type {{ defaults?: Record<string, unknown>; books?: Record<string, Record<string, unknown>> }} */
const meta = JSON.parse(readFileSync(metaPath, 'utf-8'));
const defaults = meta.defaults ?? {};
const bookMeta = meta.books ?? {};

/**
 * @param {string} dir
 * @returns {string[]}
 */
function collectJsonFiles(dir) {
  /** @type {string[]} */
  const files = [];

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectJsonFiles(fullPath));
      continue;
    }
    if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
    if (entry.name.startsWith('_')) continue;
    if (entry.name === '山海经.json') continue;
    files.push(fullPath);
  }

  return files.sort();
}

const jsonFiles = collectJsonFiles(booksDir);

if (jsonFiles.length === 0) {
  writeFileSync(outputPath, '[]\n');
  console.log('data/books/ 中暂无 JSON 文件，已写入空列表到 data/imported/stories.json');
  console.log('请将 chinese-ancient-text 等书籍 JSON 放入 data/books/ 后重试');
  process.exit(0);
}

/** @type {import('../src/lib/types.js').Story[]} */
const allStories = [];
/** @type {Record<string, number>} */
const stats = {};

for (const filePath of jsonFiles) {
  const rel = relative(booksDir, filePath);
  const raw = readFileSync(filePath, 'utf-8');
  let book;
  try {
    book = JSON.parse(raw);
  } catch (error) {
    console.error(`跳过 ${rel}：JSON 解析失败`, error);
    continue;
  }

  if (!book || typeof book !== 'object') {
    console.error(`跳过 ${rel}：不是有效的 JSON 对象`);
    continue;
  }

  const { bookName, stories } = parseBookFile(book, rel, defaults, bookMeta);
  allStories.push(...stories);
  stats[bookName] = (stats[bookName] ?? 0) + stories.length;
  console.log(`✓ ${rel} → ${bookName}：${stories.length} 篇`);
}

// 按 id 去重
const seen = new Set();
const uniqueStories = allStories.filter((story) => {
  if (seen.has(story.id)) return false;
  seen.add(story.id);
  return true;
});

writeFileSync(outputPath, `${JSON.stringify(uniqueStories, null, 2)}\n`);

console.log('\n导入完成');
console.log(`  文件数: ${jsonFiles.length}`);
console.log(`  故事数: ${uniqueStories.length}`);
console.log(`  输出: ${relative(root, outputPath)}`);
console.log('\n各书统计:');
for (const [name, count] of Object.entries(stats).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${name}: ${count}`);
}
