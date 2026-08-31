/**
 * 分批调用 translate-stories.mjs，直到没有待译或达到轮数上限
 *
 * 用法:
 *   node scripts/translate-batches.mjs
 *   node scripts/translate-batches.mjs --batch=100 --concurrency=8 --rounds=200 --pause=0
 */

import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [k, v] = arg.replace(/^--/, '').split('=');
    return [k, v ?? 'true'];
  }),
);

const batch = Number(args.batch ?? 50);
const concurrency = Number(args.concurrency ?? 2);
const maxRounds = Number(args.rounds ?? 200);
const pauseSec = Number(args.pause ?? 3);
const lang = args.lang ?? 'all';
const provider = args.provider;

function runOnce() {
  return new Promise((resolve, reject) => {
    const childArgs = [
      join(__dirname, 'translate-stories.mjs'),
      `--limit=${batch}`,
      `--concurrency=${concurrency}`,
      `--lang=${lang}`,
    ];
    if (provider) childArgs.push(`--provider=${provider}`);

    const child = spawn(process.execPath, childArgs, {
      cwd: root,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let out = '';
    child.stdout.on('data', (buf) => {
      const text = buf.toString();
      out += text;
      process.stdout.write(text);
    });
    child.stderr.on('data', (buf) => {
      const text = buf.toString();
      out += text;
      process.stderr.write(text);
    });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, out }));
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

let totalOk = 0;
let totalFail = 0;

console.log(
  `配置: provider=${provider || 'auto'}, batch=${batch}, concurrency=${concurrency}, pause=${pauseSec}s, rounds<=${maxRounds}`,
);

for (let round = 1; round <= maxRounds; round++) {
  console.log(`\n======== 第 ${round}/${maxRounds} 批 ========`);
  const { code, out } = await runOnce();
  if (code !== 0) {
    console.error(`批次异常退出 code=${code}，暂停后继续`);
  }

  const pending = out.match(/待译 (\d+) 篇/);
  const done = out.match(/成功 (\d+)，失败 (\d+)/);
  if (done) {
    totalOk += Number(done[1]);
    totalFail += Number(done[2]);
  }

  if (pending && Number(pending[1]) === 0) {
    console.log('\n全部译完。');
    break;
  }

  if (/本次处理 0 篇/.test(out)) {
    console.log('\n没有更多可处理条目。');
    break;
  }

  if (done && Number(done[1]) === 0 && Number(done[2]) > 0) {
    console.log('本批全失败，等待 10s 再试…');
    await sleep(10000);
  } else if (pauseSec > 0) {
    await sleep(pauseSec * 1000);
  }
}

console.log(`\n累计本轮：成功 ${totalOk}，失败 ${totalFail}`);
