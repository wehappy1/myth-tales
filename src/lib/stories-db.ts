import type { Story, StoryNeighbor, StoryNeighbors } from './types';
import { storyLinePreview } from './types';

/** 兼容 D1 / 本地 mock 的最小接口 */
export type DbLike = {
  prepare: (query: string) => {
    bind: (...args: unknown[]) => {
      all: <T>() => Promise<{ results: T[] }>;
      first: <T>() => Promise<T | null>;
    };
    all: <T>() => Promise<{ results: T[] }>;
    first: <T>() => Promise<T | null>;
  };
};

export function filterStories(
  stories: Story[],
  options: { category?: string; q?: string; limit?: number; offset?: number },
): Story[] {
  const { category, q, limit = 50, offset = 0 } = options;
  let result = stories;

  if (category) {
    result = result.filter((s) => s.category === category);
  }

  if (q) {
    const needle = q.toLowerCase();
    result = result.filter(
      (s) =>
        s.title.toLowerCase().includes(needle) ||
        s.content.toLowerCase().includes(needle) ||
        (s.summary?.toLowerCase().includes(needle) ?? false) ||
        (s.translation?.toLowerCase().includes(needle) ?? false),
    );
  }

  return result.slice(Math.max(0, offset), Math.max(0, offset) + limit);
}

export function computeStats(stories: Story[]) {
  const counts = stories.reduce<Record<string, number>>((acc, story) => {
    acc[story.category] = (acc[story.category] ?? 0) + 1;
    return acc;
  }, {});

  return {
    total: stories.length,
    byCategory: Object.entries(counts).map(([category, count]) => ({
      category,
      count,
    })),
  };
}

export async function getStoriesFromDb(
  db: DbLike,
  options: { category?: string; q?: string; limit?: number; offset?: number } = {},
): Promise<Story[]> {
  const { category, q, limit = 50, offset = 0 } = options;
  let query = 'SELECT * FROM stories WHERE 1=1';
  const params: unknown[] = [];

  if (category) {
    query += ' AND category = ?';
    params.push(category);
  }

  if (q) {
    // FTS 覆盖标题/正文；译文额外用 LIKE，确保白话/中文译名可搜
    query +=
      ' AND (stories.rowid IN (SELECT rowid FROM stories_fts WHERE stories_fts MATCH ?) OR IFNULL(translation, \'\') LIKE ?)';
    params.push(q, `%${q}%`);
  }

  query += ' ORDER BY updated_at DESC LIMIT ? OFFSET ?';
  params.push(limit, Math.max(0, offset));

  // D1 必须一次 bind 全部参数；逐个 bind 会覆盖之前的绑定
  const { results } = await db.prepare(query).bind(...params).all<Story>();
  return results;
}

export async function getStoryByIdFromDb(
  db: DbLike,
  id: string,
): Promise<Story | null> {
  return (
    (await db
      .prepare('SELECT * FROM stories WHERE id = ?')
      .bind(id)
      .first<Story>()) ?? null
  );
}

export async function getStoryStatsFromDb(db: DbLike) {
  const total = await db
    .prepare('SELECT COUNT(*) as count FROM stories')
    .first<{ count: number }>();

  const byCategory = await db
    .prepare(
      'SELECT category, COUNT(*) as count FROM stories GROUP BY category ORDER BY count DESC',
    )
    .all<{ category: string; count: number }>();

  return {
    total: total?.count ?? 0,
    byCategory: byCategory.results,
  };
}

export async function getStoriesBySourceFromDb(
  db: DbLike,
  sourceText: string,
): Promise<Story[]> {
  const { results } = await db
    .prepare(
      'SELECT * FROM stories WHERE IFNULL(source_text, \'\') = ? ORDER BY rowid ASC',
    )
    .bind(sourceText)
    .all<Story>();
  return results;
}

type NeighborRow = {
  id: string;
  title: string;
  content: string;
  translation: string | null;
  summary: string | null;
};

function rowToNeighbor(row: NeighborRow): StoryNeighbor {
  return {
    id: row.id,
    title: row.title,
    preview: storyLinePreview(row),
  };
}

/**
 * 只查当前篇目的上/下一则，避免把整本书拉进内存（世说新语等上千则时原先会很慢）
 */
export async function getStoryNeighborsFromDb(
  db: DbLike,
  id: string,
): Promise<StoryNeighbors | null> {
  const current = await db
    .prepare(
      'SELECT rowid AS rid, id, source_text FROM stories WHERE id = ?',
    )
    .bind(id)
    .first<{ rid: number; id: string; source_text: string | null }>();
  if (!current) return null;

  const sourceText = current.source_text ?? null;
  if (!sourceText) {
    return {
      source_text: null,
      index: 0,
      total: 1,
      prev: null,
      next: null,
    };
  }

  const [totalRow, indexRow, prev, next] = await Promise.all([
    db
      .prepare(
        'SELECT COUNT(*) AS count FROM stories WHERE IFNULL(source_text, \'\') = ?',
      )
      .bind(sourceText)
      .first<{ count: number }>(),
    db
      .prepare(
        'SELECT COUNT(*) AS count FROM stories WHERE IFNULL(source_text, \'\') = ? AND rowid < ?',
      )
      .bind(sourceText, current.rid)
      .first<{ count: number }>(),
    db
      .prepare(
        `SELECT id, title,
                substr(content, 1, 80) AS content,
                substr(IFNULL(translation, ''), 1, 80) AS translation,
                summary
         FROM stories
         WHERE IFNULL(source_text, '') = ? AND rowid < ?
         ORDER BY rowid DESC LIMIT 1`,
      )
      .bind(sourceText, current.rid)
      .first<NeighborRow>(),
    db
      .prepare(
        `SELECT id, title,
                substr(content, 1, 80) AS content,
                substr(IFNULL(translation, ''), 1, 80) AS translation,
                summary
         FROM stories
         WHERE IFNULL(source_text, '') = ? AND rowid > ?
         ORDER BY rowid ASC LIMIT 1`,
      )
      .bind(sourceText, current.rid)
      .first<NeighborRow>(),
  ]);

  return {
    source_text: sourceText,
    index: indexRow?.count ?? 0,
    total: totalRow?.count ?? 1,
    prev: prev ? rowToNeighbor(prev) : null,
    next: next ? rowToNeighbor(next) : null,
  };
}
