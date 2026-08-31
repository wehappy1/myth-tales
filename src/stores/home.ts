import { proxy } from 'valtio';
import { fetchStories } from '../lib/api';
import type { Story } from '../lib/types';

const PAGE_SIZE = 24;

export const homeStore = proxy({
  stories: [] as Story[],
  loading: false,
  loadingMore: false,
  hasMore: true,
  error: null as string | null,
  scrollY: 0,
  /** 当前已加载数据对应的查询键：`q|category` */
  queryKey: '',
});

export function homeQueryKey(q?: string, category?: string) {
  return `${q ?? ''}|${category ?? ''}`;
}

export async function loadHomeStories(q?: string, category?: string) {
  const key = homeQueryKey(q, category);
  if (homeStore.queryKey === key && homeStore.stories.length > 0) {
    return;
  }

  homeStore.loading = true;
  homeStore.loadingMore = false;
  homeStore.error = null;
  homeStore.hasMore = true;

  try {
    const data = await fetchStories({
      q,
      category,
      limit: PAGE_SIZE,
      offset: 0,
      stats: false,
    });
    homeStore.stories = data.stories;
    homeStore.hasMore = data.hasMore ?? data.stories.length >= PAGE_SIZE;
    homeStore.queryKey = key;
    homeStore.scrollY = 0;
  } catch (err) {
    homeStore.error = err instanceof Error ? err.message : '加载失败';
    homeStore.stories = [];
    homeStore.hasMore = false;
  } finally {
    homeStore.loading = false;
  }
}

export async function loadMoreHomeStories(q?: string, category?: string) {
  const key = homeQueryKey(q, category);
  if (homeStore.queryKey !== key) return;
  if (homeStore.loading || homeStore.loadingMore || !homeStore.hasMore) return;

  homeStore.loadingMore = true;
  homeStore.error = null;

  try {
    const offset = homeStore.stories.length;
    const data = await fetchStories({
      q,
      category,
      limit: PAGE_SIZE,
      offset,
      stats: false,
    });
    const existing = new Set(homeStore.stories.map((s) => s.id));
    const next = data.stories.filter((s) => !existing.has(s.id));
    homeStore.stories.push(...next);
    homeStore.hasMore =
      data.hasMore ?? data.stories.length >= PAGE_SIZE;
  } catch (err) {
    homeStore.error = err instanceof Error ? err.message : '加载失败';
  } finally {
    homeStore.loadingMore = false;
  }
}
