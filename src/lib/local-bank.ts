/**
 * 本地磁盘故事库（Vite API 用）：主库 + 用户新增，运行时读取，无需重启即可看到新故事
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createHash } from 'node:crypto';
import type { Story, StoryNeighbor, StoryNeighbors } from './types';
import { isExcludedStory, storyLinePreview } from './types';

const root = process.cwd();
const storiesPath = join(root, 'data/imported/stories.json');
const userStoriesPath = join(root, 'data/imported/user-stories.json');
const translationsPath = join(root, 'data/imported/translations.json');

function readJson<T>(path: string, fallback: T): T {
  if (!existsSync(path)) return fallback;
  return JSON.parse(readFileSync(path, 'utf-8')) as T;
}

export function readTranslationsMap(): Record<string, string> {
  return readJson(translationsPath, {});
}

export function readAllDiskStories(): Story[] {
  const imported = readJson<Story[]>(storiesPath, []);
  const user = readJson<Story[]>(userStoriesPath, []);
  const map = readTranslationsMap();
  const merged = [...user, ...imported].filter((s) => !isExcludedStory(s));
  return merged.map((story) => ({
    ...story,
    translation: story.translation || map[story.id] || null,
  }));
}

export function readDiskStoryById(id: string): Story | null {
  return readAllDiskStories().find((s) => s.id === id) ?? null;
}

export function readDiskStoriesBySource(sourceText: string): Story[] {
  return readAllDiskStories().filter((s) => (s.source_text ?? '') === sourceText);
}

function toNeighbor(story: Story): StoryNeighbor {
  return {
    id: story.id,
    title: story.title,
    preview: storyLinePreview(story),
  };
}

export function readDiskStoryNeighbors(id: string): StoryNeighbors | null {
  const all = readAllDiskStories();
  const story = all.find((s) => s.id === id);
  if (!story) return null;
  const sourceText = story.source_text ?? null;
  const siblings = sourceText
    ? all.filter((s) => (s.source_text ?? '') === sourceText)
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

export function computeDiskStats(stories: Story[]) {
  const counts = stories.reduce<Record<string, number>>((acc, story) => {
    acc[story.category] = (acc[story.category] ?? 0) + 1;
    return acc;
  }, {});
  return {
    total: stories.length,
    byCategory: Object.entries(counts)
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count),
  };
}

function makeSummary(content: string) {
  const text = content.replace(/\s+/g, ' ').trim();
  return text.length <= 80 ? text : `${text.slice(0, 80)}…`;
}

function makeTitle(content: string) {
  const text = content.replace(/\s+/g, ' ').trim();
  return text.length <= 24 ? text : `${text.slice(0, 24)}…`;
}

export type CreateStoryInput = {
  category: string;
  content: string;
  title?: string;
};

export function createDiskStory(input: CreateStoryInput): Story {
  const content = input.content.trim();
  if (!content) throw new Error('content_required');
  const category = input.category.trim();
  if (!category) throw new Error('category_required');

  const title = (input.title?.trim() || makeTitle(content)).slice(0, 80);
  const idSeed = `${category}|${title}|${content.slice(0, 120)}|${Date.now()}`;
  const hash = createHash('sha1').update(idSeed).digest('hex').slice(0, 10);
  const isEnglish = category === 'english';

  const story: Story = {
    id: `user-${hash}`,
    title,
    content,
    translation: null,
    summary: makeSummary(content),
    category,
    tradition: isEnglish ? 'cross' : 'chinese',
    region: isEnglish ? null : '华夏',
    source_id: 'user',
    source_text: '用户新增',
    reference: null,
    tags: '用户新增',
    language: isEnglish ? 'en' : 'zh',
    license: null,
    external_url: null,
  };

  mkdirSync(dirname(userStoriesPath), { recursive: true });
  const user = readJson<Story[]>(userStoriesPath, []);
  user.unshift(story);
  writeFileSync(userStoriesPath, `${JSON.stringify(user, null, 2)}\n`);
  return story;
}
