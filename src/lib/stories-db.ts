import type { Story, StoryNeighbor, StoryNeighbors } from './types';
import { storyLinePreview } from './types';

export type DbLike = {
  prepare: (query: string) => {
    bind: (...args: unknown[]) => {
      all: <T>() => Promise<{ results: T[] }>;
      first: <T>() => Promise<T | null>;
    };
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

  const stmt = db.prepare(query);
  const bound = params.reduce((s, p) => s.bind(p), stmt);
  const { results } = await bound.all<Story>();
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

function toNeighbor(story: Story): StoryNeighbor {
  return {
    id: story.id,
    title: story.title,
    preview: storyLinePreview(story),
  };
}

export async function getStoryNeighborsFromDb(
  db: DbLike,
  id: string,
): Promise<StoryNeighbors | null> {
  const story = await getStoryByIdFromDb(db, id);
  if (!story) return null;
  const sourceText = story.source_text ?? null;
  const siblings = sourceText
    ? await getStoriesBySourceFromDb(db, sourceText)
    : [story];
  const index = siblings.findIndex((s) => s.id === id);
  if (index < 0) return null;
  return {
    source_text: sourceText,
    index,
    total: siblings.length,
    prev: index > 0 ? toNeighbor(siblings[index - 1]) : null,
    next: index < siblings.length - 1 ? toNeighbor(siblings[index + 1]) : null,
  };
}
