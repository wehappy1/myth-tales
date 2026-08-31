/**
 * 将文本译为简体中文（MyMemory 免费接口）
 * - 英文：en → zh-CN
 * - 古文：zh-CN → en → zh-CN（中转，尽量白话化）
 *
 * @param {string} text
 * @param {{ source?: string; pauseMs?: number }} [options]
 */
export async function translateToChinese(text, options = {}) {
  const source = normalizeSource(options.source ?? 'auto');
  const pauseMs = options.pauseMs ?? 350;
  const chunks = splitText(text, 450);
  const parts = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    let translated;
    if (source === 'zh-CN') {
      const english = await translateChunk(chunk, 'zh-CN', 'en');
      await sleep(pauseMs);
      translated = await translateChunk(english, 'en', 'zh-CN');
    } else {
      translated = await translateChunk(chunk, source === 'autodetect' ? 'autodetect' : source, 'zh-CN');
    }
    parts.push(translated);
    if (i < chunks.length - 1) await sleep(pauseMs);
  }

  return parts.join('');
}

/**
 * @param {string} source
 */
function normalizeSource(source) {
  if (source === 'en') return 'en';
  if (source === 'zh' || source === 'zh-CN') return 'zh-CN';
  return 'autodetect';
}

/**
 * @param {string} text
 * @param {number} maxLen
 */
function splitText(text, maxLen) {
  const normalized = text.replace(/\r\n/g, '\n').trim();
  if (normalized.length <= maxLen) return [normalized];

  const chunks = [];
  let rest = normalized;
  while (rest.length > maxLen) {
    let cut = rest.lastIndexOf('\n\n', maxLen);
    if (cut < maxLen * 0.4) cut = rest.lastIndexOf('\n', maxLen);
    if (cut < maxLen * 0.4) cut = rest.lastIndexOf('。', maxLen);
    if (cut < maxLen * 0.4) cut = rest.lastIndexOf('. ', maxLen);
    if (cut < maxLen * 0.4) cut = rest.lastIndexOf(' ', maxLen);
    if (cut < maxLen * 0.4) cut = maxLen;
    chunks.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) chunks.push(rest);
  return chunks;
}

/**
 * @param {string} text
 * @param {string} source
 * @param {string} target
 */
async function translateChunk(text, source, target) {
  const url = new URL('https://api.mymemory.translated.net/get');
  url.searchParams.set('q', text);
  url.searchParams.set('langpair', `${source}|${target}`);

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`翻译失败 HTTP ${res.status}`);
  }
  const data = await res.json();
  const translated = data?.responseData?.translatedText;
  if (!translated || data.responseStatus !== 200) {
    throw new Error(data?.responseDetails || '翻译结果为空');
  }
  return translated;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
