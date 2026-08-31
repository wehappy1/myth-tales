export interface Story {
  id: string;
  title: string;
  content: string;
  /** 中文译文（英文原文的翻译，或古文白话） */
  translation?: string | null;
  summary?: string | null;
  category: string;
  tradition?: string | null;
  region?: string | null;
  source_id?: string | null;
  source_text?: string | null;
  reference?: string | null;
  tags?: string | null;
  language?: string | null;
  license?: string | null;
  external_url?: string | null;
}

export interface DataSource {
  id: string;
  name: string;
  url?: string;
  license?: string;
  language?: string;
  description?: string;
  type: 'api' | 'dataset' | 'website' | 'academic';
  usable: 'direct' | 'import' | 'crawl' | 'manual';
  notes?: string;
}

export const CATEGORIES: Record<string, string> = {
  creature: '志怪',
  myth: '神话',
  folktale: '民间传说',
  fable: '寓言',
  legend: '传奇',
  english: '英语',
  motif: '母题索引',
};

export const DEFAULT_HOME_CATEGORY = 'creature';

export const TRADITIONS: Record<string, string> = {
  chinese: '中国',
  greek: '希腊',
  norse: '北欧',
  egyptian: '埃及',
  mesopotamian: '美索不达米亚',
  indian: '印度',
  japanese: '日本',
  cross: '跨文化',
};

export function parseTags(tags?: string | null): string[] {
  if (!tags) return [];
  return tags.split(',').map((t) => t.trim()).filter(Boolean);
}

export function formatCategory(category: string): string {
  return CATEGORIES[category] ?? category;
}

export function formatTradition(tradition?: string | null): string {
  if (!tradition) return '未知';
  return TRADITIONS[tradition] ?? tradition;
}

/** 不再展示的典籍（如山海经） */
export function isExcludedStory(story: Pick<Story, 'id' | 'source_text' | 'tags'>) {
  if (story.id.startsWith('山海经-')) return true;
  if (story.source_text === '《山海经》') return true;
  if ((story.tags ?? '').includes('山海经')) return true;
  return false;
}

/** 英文原文或古文是否需要中文/白话译文 */
export function storyNeedsChineseTranslation(
  story: Pick<Story, 'language' | 'translation'>,
): boolean {
  if (story.translation?.trim()) return false;
  const lang = story.language ?? 'zh';
  return lang === 'en' || lang === 'zh';
}

export function storyCardDescription(story: Story, maxLen = 80): string {
  const source =
    story.translation?.trim() ||
    story.summary?.trim() ||
    story.content.trim();
  const text = source.replace(/\s+/g, ' ');
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen)}…`;
}

/** 导航按钮用的一行预览 */
export function storyLinePreview(story: Pick<Story, 'content' | 'translation' | 'summary' | 'title'>, maxLen = 48): string {
  const source =
    story.content?.trim() ||
    story.translation?.trim() ||
    story.summary?.trim() ||
    story.title?.trim() ||
    '';
  const text = source.replace(/\s+/g, ' ');
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen)}…`;
}

export type StoryNeighbor = {
  id: string;
  title: string;
  preview: string;
};

export type StoryNeighbors = {
  source_text: string | null;
  index: number;
  total: number;
  prev: StoryNeighbor | null;
  next: StoryNeighbor | null;
};

export function encodeBookKey(sourceText: string): string {
  return encodeURIComponent(sourceText);
}

export function decodeBookKey(key: string): string {
  return decodeURIComponent(key);
}

export function bookPath(sourceText: string, storyId?: string): string {
  const base = `/book/${encodeBookKey(sourceText)}`;
  if (!storyId) return base;
  return `${base}/${encodeURIComponent(storyId)}`;
}
