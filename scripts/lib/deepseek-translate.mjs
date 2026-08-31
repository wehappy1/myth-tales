/**
 * DeepSeek 翻译（适合英文→中文、古文→白话）
 *
 * 环境变量:
 *   DEEPSEEK_API_KEY   必填
 *   DEEPSEEK_MODEL     默认 deepseek-chat
 *   DEEPSEEK_BASE_URL  默认 https://api.deepseek.com
 */

const DEFAULT_BASE = 'https://api.deepseek.com';
const DEFAULT_MODEL = 'deepseek-chat';

/**
 * @param {string} text
 * @param {{ source?: string; pauseMs?: number; apiKey?: string; model?: string; baseUrl?: string }} [options]
 */
export async function translateToChinese(text, options = {}) {
  const apiKey = options.apiKey || process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    throw new Error('缺少 DEEPSEEK_API_KEY');
  }

  const source = options.source ?? 'auto';
  const pauseMs = options.pauseMs ?? 0;
  const model = options.model || process.env.DEEPSEEK_MODEL || DEFAULT_MODEL;
  const baseUrl = (options.baseUrl || process.env.DEEPSEEK_BASE_URL || DEFAULT_BASE).replace(
    /\/$/,
    '',
  );

  const chunks = splitText(text, 6000);
  const parts = [];

  for (let i = 0; i < chunks.length; i++) {
    parts.push(await translateChunk(chunks[i], source, { apiKey, model, baseUrl }));
    if (i < chunks.length - 1) await sleep(pauseMs);
  }

  return parts.join('\n\n').trim();
}

/**
 * @param {string} text
 * @param {string} source
 * @param {{ apiKey: string; model: string; baseUrl: string }} cfg
 */
async function translateChunk(text, source, cfg) {
  const isEnglish = source === 'en';
  const system = isEnglish
    ? '你是专业翻译。将英文民间故事准确译为流畅简体中文。只输出译文正文，不要解释、不要标题、不要前后缀。'
    : '你是古文专家。将文言文/古白话译为准确、流畅的现代汉语白话。只输出译文正文，不要解释、不要标题、不要前后缀。';

  let lastError = new Error('DeepSeek 翻译失败');
  for (let attempt = 1; attempt <= 5; attempt++) {
    const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify({
        model: cfg.model,
        temperature: 0.3,
        max_tokens: 8192,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: text },
        ],
      }),
    });

    const data = await res.json().catch(() => ({}));
    if (res.status === 429) {
      const wait = attempt * 5000;
      lastError = new Error(data?.error?.message || `速率限制 HTTP ${res.status}`);
      await sleep(wait);
      continue;
    }
    if (!res.ok) {
      const msg = data?.error?.message || data?.msg || `HTTP ${res.status}`;
      throw new Error(`DeepSeek 翻译失败: ${msg}`);
    }

    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || !content.trim()) {
      throw new Error('DeepSeek 返回空译文');
    }
    return content.trim();
  }
  throw lastError;
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
    if (cut < maxLen * 0.4) cut = maxLen;
    chunks.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) chunks.push(rest);
  return chunks;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
