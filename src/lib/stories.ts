import type { Story } from './types';
import { isExcludedStory } from './types';
import seedStories from '../../data/seed/stories.json';
import importedStories from '../../data/imported/stories.json';
import translationsMap from '../../data/imported/translations.json';
import {
  computeStats,
  filterStories,
  getStoriesFromDb,
  getStoryByIdFromDb,
  getStoryStatsFromDb,
  type DbLike,
} from './stories-db';

export { storyNeedsChineseTranslation, isExcludedStory } from './types';

function withTranslations(stories: Story[]): Story[] {
  const map = translationsMap as Record<string, string>;
  return stories.map((story) => ({
    ...story,
    translation: story.translation || map[story.id] || null,
  }));
}

function getLocalStories(): Story[] {
  const imported = importedStories as Story[];
  const base = imported.length > 0 ? imported : (seedStories as Story[]);
  return withTranslations(base.filter((s) => !isExcludedStory(s)));
}

export async function getStories(
  db: DbLike | undefined,
  options: {
    category?: string;
    q?: string;
    limit?: number;
    offset?: number;
  } = {},
): Promise<Story[]> {
  if (db) {
    try {
      const rows = await getStoriesFromDb(db, options);
      return rows.filter((s) => !isExcludedStory(s));
    } catch {
      // 本地 D1 未初始化时回退到 JSON
    }
  }
  return filterStories(getLocalStories(), options);
}

export async function getStoryById(
  db: DbLike | undefined,
  id: string,
): Promise<Story | null> {
  if (db) {
    try {
      const story = await getStoryByIdFromDb(db, id);
      if (story && isExcludedStory(story)) return null;
      return story;
    } catch {
      // fall through
    }
  }
  return getLocalStories().find((s) => s.id === id) ?? null;
}

export async function getStoryStats(db: DbLike | undefined) {
  if (db) {
    try {
      return await getStoryStatsFromDb(db);
    } catch {
      // fall through
    }
  }
  return computeStats(getLocalStories());
}

/** 在已过滤全集上再分页，并返回是否还有更多 */
export function paginateStories(
  stories: Story[],
  options: { category?: string; q?: string; limit?: number; offset?: number },
) {
  const limit = options.limit ?? 24;
  const offset = options.offset ?? 0;
  // 先按条件过滤但不截断，再 slice，才能判断 hasMore
  const { category, q } = options;
  let result = stories;
  if (category) result = result.filter((s) => s.category === category);
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
  const page = result.slice(offset, offset + limit);
  return {
    stories: page,
    hasMore: offset + page.length < result.length,
    totalMatched: result.length,
  };
}
