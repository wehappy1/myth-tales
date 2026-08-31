/**
 * 批量为英文 / 古文生成中文译文，写入 data/imported/translations.json
 *
 * 智谱:
 *   ZHIPU_API_KEY=...
 *   pnpm translate -- --provider=zhipu --limit=50 --concurrency=2
 *
 * DeepSeek:
 *   DEEPSEEK_API_KEY=...
 *   pnpm translate -- --provider=deepseek --limit=50 --concurrency=3
 *
 * 参数:
 *   --limit=50
 *   --concurrency=2
 *   --lang=en|zh|all
 *   --force
 *   --provider=zhipu|deepseek|mymemory
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { translateToChinese as translateMyMemory } from './lib/google-translate.mjs';
import { translateToChinese as translateZhipu } from './lib/zhipu-translate.mjs';
import { translateToChinese as translateDeepseek } from './lib/deepseek-translate.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const envPath = join(root, '.env');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

const storiesPath = join(root, 'data/imported/stories.json');
const translationsPath = join(root, 'data/imported/translations.json');

const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [k, v] = arg.replace(/^--/, '').split('=');
    return [k, v ?? 'true'];
  }),
);

const limit = Number(args.limit ?? 50);
const concurrency = Math.max(1, Number(args.concurrency ?? 2));
const langFilter = args.lang ?? 'all';
const force = args.force === 'true';
const hasZhipu = Boolean(process.env.ZHIPU_API_KEY);
const hasDeepseek = Boolean(process.env.DEEPSEEK_API_KEY);

/** @type {'zhipu' | 'deepseek' | 'mymemory'} */
const provider =
  /** @type {'zhipu' | 'deepseek' | 'mymemory'} */ (
    args.provider ??
      (hasDeepseek ? 'deepseek' : hasZhipu ? 'zhipu' : 'mymemory')
  );

if (provider === 'zhipu' && !hasZhipu) {
  console.error('使用智谱翻译需要设置环境变量 ZHIPU_API_KEY');
  process.exit(1);
}
if (provider === 'deepseek' && !hasDeepseek) {
  console.error('使用 DeepSeek 翻译需要设置环境变量 DEEPSEEK_API_KEY');
  process.exit(1);
}

const translate =
  provider === 'zhipu'
    ? translateZhipu
    : provider === 'deepseek'
      ? translateDeepseek
      : translateMyMemory;

const modelLabel =
  provider === 'zhipu'
    ? process.env.ZHIPU_MODEL || 'glm-4.7'
    : provider === 'deepseek'
      ? process.env.DEEPSEEK_MODEL || 'deepseek-chat'
      : '';

const stories = JSON.parse(readFileSync(storiesPath, 'utf-8'));
/** @type {Record<string, string>} */
let translations = existsSync(translationsPath)
  ? JSON.parse(readFileSync(translationsPath, 'utf-8'))
  : {};

const candidates = stories
  .filter((story) => {
    if (!force && translations[story.id]) return false;
    const lang = story.language ?? 'zh';
    if (langFilter !== 'all' && lang !== langFilter) return false;
    return lang === 'en' || lang === 'zh';
  })
  .sort((a, b) => a.content.length - b.content.length);

const batch = candidates.slice(0, limit);
console.log(`引擎: ${provider}${modelLabel ? ` (${modelLabel})` : ''}`);
console.log(`并发: ${concurrency}`);
console.log(`待译 ${candidates.length} 篇，本次处理 ${batch.length} 篇`);

mkdirSync(dirname(translationsPath), { recursive: true });

let ok = 0;
let fail = 0;
let dirty = 0;
let writeChain = Promise.resolve();

function persist() {
  writeChain = writeChain.then(() => {
    writeFileSync(translationsPath, `${JSON.stringify(translations, null, 2)}\n`);
  });
  return writeChain;
}

async function saveResult(id, text) {
  translations[id] = text;
  dirty += 1;
  ok += 1;
  if (dirty >= 10) {
    dirty = 0;
    await persist();
  }
}

/**
 * @template T
 * @param {T[]} items
 * @param {number} width
 * @param {(item: T, index: number) => Promise<void>} worker
 */
async function mapPool(items, width, worker) {
  let next = 0;
  async function run() {
    while (next < items.length) {
      const i = next++;
      await worker(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(width, items.length) }, () => run()));
}

const started = Date.now();

await mapPool(batch, concurrency, async (story) => {
  const source = story.language === 'en' ? 'en' : 'zh-CN';
  const label = `${story.id} (${story.language}, ${story.content.length}字)`;
  try {
    const translation = await translate(story.content, { source, pauseMs: 0 });
    if (!translation.trim()) throw new Error('空译文');
    await saveResult(story.id, translation.trim());
    console.log(`✓ ${label}`);
  } catch (error) {
    fail += 1;
    console.log(`✗ ${label}: ${error instanceof Error ? error.message : error}`);
  }
});

await persist();

const elapsed = ((Date.now() - started) / 1000).toFixed(1);
const rate = ok > 0 ? (ok / (Number(elapsed) || 1)).toFixed(2) : '0';
console.log(
  `完成：成功 ${ok}，失败 ${fail}，累计译文 ${Object.keys(translations).length}，耗时 ${elapsed}s，约 ${rate} 篇/秒`,
);
