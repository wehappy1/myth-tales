/**
 * 将英语故事写入远程 D1（参数化查询，避开 SQL 文本长度限制）
 * 用法: node scripts/seed-english-remote.mjs
 */
import { readFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const ACCOUNT_ID = '4a407cd21e2d3b5771a89a8ccaba8375';
const DATABASE_ID = '0772a3fc-13e2-4120-a7a4-270cc213bfdd';
const BATCH = 10;

function readOauthToken() {
  const configPath = join(
    homedir(),
    'Library/Preferences/.wrangler/config/default.toml',
  );
  const text = readFileSync(configPath, 'utf8');
  const match = text.match(/oauth_token\s*=\s*"([^"]+)"/);
  if (!match) throw new Error(`未找到 oauth_token: ${configPath}`);
  return match[1];
}

async function d1Batch(token, statements) {
  const url = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/d1/database/${DATABASE_ID}/query`;
  // D1 HTTP API: one SQL per request with params; use sequential for reliability
  const results = [];
  for (const stmt of statements) {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sql: stmt.sql, params: stmt.params }),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      const err = JSON.stringify(data.errors ?? data, null, 2);
      throw new Error(`D1 query failed: ${err}`);
    }
    results.push(data);
  }
  return results;
}

const token = readOauthToken();
const stories = JSON.parse(
  readFileSync(join(root, 'data/imported/stories.json'), 'utf8'),
);
const sources = JSON.parse(readFileSync(join(root, 'data/sources.json'), 'utf8'));
const translationsPath = join(root, 'data/imported/translations.json');
const translations = existsSync(translationsPath)
  ? JSON.parse(readFileSync(translationsPath, 'utf8'))
  : {};

const english = stories.filter(
  (s) =>
    s.category === 'english' ||
    s.source_id === 'ashliman-folktexts' ||
    (typeof s.language === 'string' && s.language.toLowerCase().startsWith('en')),
);
for (const s of english) {
  if (!s.translation && translations[s.id]) s.translation = translations[s.id];
}

const source = sources.find((s) => s.id === 'ashliman-folktexts') ?? {
  id: 'ashliman-folktexts',
  name: "Ashliman's Folktexts",
  url: 'https://www.pitt.edu/~dash/folktexts.html',
  license: 'CC BY-SA 4.0',
  language: 'en',
  description: 'English folktales collected by D.L. Ashliman',
};

console.log(`准备写入远程 D1：${english.length} 条英语故事`);

await d1Batch(token, [
  {
    sql: `INSERT OR REPLACE INTO sources (id, name, url, license, language, description)
          VALUES (?, ?, ?, ?, ?, ?)`,
    params: [
      source.id,
      source.name,
      source.url,
      source.license,
      source.language,
      source.description,
    ],
  },
]);

let done = 0;
let failed = 0;
for (let i = 0; i < english.length; i += BATCH) {
  const chunk = english.slice(i, i + BATCH);
  const stmts = chunk.map((story) => ({
    sql: `INSERT OR REPLACE INTO stories
      (id, title, content, translation, summary, category, tradition, region,
       source_id, source_text, reference, tags, language, license, external_url)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    params: [
      story.id,
      story.title,
      story.content,
      story.translation ?? null,
      story.summary ?? null,
      story.category,
      story.tradition ?? null,
      story.region ?? null,
      story.source_id ?? null,
      story.source_text ?? null,
      story.reference ?? null,
      story.tags ?? null,
      story.language ?? 'en',
      story.license ?? null,
      story.external_url ?? null,
    ],
  }));

  try {
    await d1Batch(token, stmts);
    done += chunk.length;
    if (done % 50 === 0 || done === english.length) {
      console.log(`进度 ${done}/${english.length}`);
    }
  } catch (err) {
    failed += chunk.length;
    console.error(`批次 ${i}-${i + chunk.length} 失败:`, err.message);
    // 降级为逐条，尽量写完
    for (const stmt of stmts) {
      try {
        await d1Batch(token, [stmt]);
        done += 1;
        failed -= 1;
      } catch (e) {
        console.error(`  单条失败 ${stmt.params[0]}:`, e.message);
      }
    }
  }
}

// 校验
const check = await fetch(
  `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/d1/database/${DATABASE_ID}/query`,
  {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      sql: `SELECT COUNT(*) AS c FROM stories WHERE category = 'english'
            OR LOWER(IFNULL(language, '')) = 'en'
            OR LOWER(IFNULL(language, '')) LIKE 'en-%'`,
    }),
  },
).then((r) => r.json());

const count = check?.result?.[0]?.results?.[0]?.c ?? check?.result?.[0]?.c;
console.log(`完成。成功约 ${done}，失败 ${failed}，远程英语计数: ${count}`);
