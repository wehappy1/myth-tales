import { createHash } from 'node:crypto';

/** @typedef {{ name: string; description?: string; articles?: BookArticle[] }} BookFile */
/** @typedef {{ title?: string; content?: string | string[] }} BookArticle */

const BOOK_NAME_RE = /^(.+?)(?:\.json)?$/;

/**
 * @param {string} filename
 */
export function bookNameFromFile(filename) {
  const base = filename.replace(/\.json$/i, '');
  return base.startsWith('_') ? null : base;
}

/**
 * @param {string} text
 */
export function slugify(text) {
  return text
    .normalize('NFKC')
    .replace(/[^\u4e00-\u9fff\w]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
    .toLowerCase();
}

/**
 * @param {string} bookName
 * @param {string} articleTitle
 * @param {number} index
 * @param {string} content
 */
export function makeStoryId(bookName, articleTitle, index, content) {
  const hash = createHash('sha1')
    .update(`${bookName}|${articleTitle}|${index}|${content.slice(0, 64)}`)
    .digest('hex')
    .slice(0, 8);
  const bookSlug = slugify(bookName) || 'book';
  return `${bookSlug}-${hash}`;
}

/**
 * @param {string} content
 */
export function makeTitle(content, bookName, articleTitle, index) {
  const trimmed = content.replace(/\s+/g, ' ').trim();
  const firstClause = trimmed.split(/[。！？；]/)[0]?.trim() ?? trimmed;
  if (firstClause.length >= 4 && firstClause.length <= 24) {
    return firstClause;
  }
  if (firstClause.length > 24) {
    return `${firstClause.slice(0, 22)}…`;
  }
  return `${bookName} · ${articleTitle} · 第${index + 1}则`;
}

/**
 * @param {string} content
 */
export function makeSummary(content) {
  const text = content.replace(/\s+/g, ' ').trim();
  if (text.length <= 80) return text;
  const cut = text.slice(0, 80);
  const lastStop = Math.max(cut.lastIndexOf('。'), cut.lastIndexOf('，'));
  return (lastStop > 20 ? cut.slice(0, lastStop + 1) : `${cut}…`).trim();
}

/**
 * @param {BookFile} book
 * @param {string} filename
 * @param {Record<string, unknown>} defaults
 * @param {Record<string, Record<string, unknown>>} bookMeta
 */
export function parseBookFile(book, filename, defaults, bookMeta) {
  const bookName = book.name || bookNameFromFile(filename) || filename;
  const meta = { ...defaults, ...(bookMeta[bookName] ?? {}) };
  /** @type {import('../../src/lib/types.js').Story[]} */
  const stories = [];

  const articles = Array.isArray(book.articles) ? book.articles : [];

  for (const article of articles) {
    const articleTitle = article.title?.trim() || '正文';
    const paragraphs = normalizeContent(article.content);

    paragraphs.forEach((paragraph, index) => {
      const content = paragraph.trim();
      if (content.length < 8) return;

      stories.push({
        id: makeStoryId(bookName, articleTitle, index, content),
        title: makeTitle(content, bookName, articleTitle, index),
        content,
        translation: null,
        summary: makeSummary(content),
        category: String(meta.category ?? 'legend'),
        tradition: meta.tradition ?? 'chinese',
        region: meta.region ?? '华夏',
        source_id: meta.source_id ?? 'chinese-ancient-text',
        source_text: `《${bookName}》`,
        reference: articleTitle,
        tags: meta.tags ?? bookName,
        language: meta.language ?? 'zh',
        license: meta.license ?? 'Public Domain',
        external_url: meta.external_url ?? null,
      });
    });
  }

  return { bookName, stories };
}

/**
 * @param {string | string[] | undefined} content
 * @returns {string[]}
 */
function normalizeContent(content) {
  if (Array.isArray(content)) {
    return content.flatMap((item) => normalizeContent(item));
  }
  if (typeof content === 'string' && content.trim()) {
    return [content];
  }
  return [];
}
