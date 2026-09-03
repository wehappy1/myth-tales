import type { DataSource, Story, StoryNeighbors } from './types';

export async function fetchStories(params: {
  q?: string;
  category?: string;
  limit?: number;
  offset?: number;
  /** 默认 true；首页翻页可关，避免每次全表统计 */
  stats?: boolean;
}): Promise<{
  stories: Story[];
  hasMore?: boolean;
  totalMatched?: number;
  stats: { total: number; byCategory: { category: string; count: number }[] };
}> {
  const search = new URLSearchParams();
  if (params.q) search.set('q', params.q);
  if (params.category) search.set('category', params.category);
  if (params.limit) search.set('limit', String(params.limit));
  if (params.offset) search.set('offset', String(params.offset));
  if (params.stats === false) search.set('stats', '0');

  const res = await fetch(`/api/stories?${search.toString()}`);
  if (!res.ok) throw new Error('加载故事失败');
  return res.json();
}

export async function fetchStory(id: string): Promise<Story | null> {
  const res = await fetch(`/api/stories/${encodeURIComponent(id)}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error('加载故事失败');
  await assertJson(res, '加载故事失败');
  const data = (await res.json()) as { story: Story; neighbors?: StoryNeighbors | null };
  return data.story;
}

const storyInflight = new Map<
  string,
  Promise<{ story: Story | null; neighbors: StoryNeighbors | null }>
>();

/** 一次拉齐故事与同书相邻则；优先走详情接口里附带的 neighbors */
export function fetchStoryWithNeighbors(id: string): Promise<{
  story: Story | null;
  neighbors: StoryNeighbors | null;
}> {
  const hit = storyInflight.get(id);
  if (hit) return hit;

  const request = (async () => {
    const res = await fetch(`/api/stories/${encodeURIComponent(id)}`);
    if (res.status === 404) return { story: null, neighbors: null };
    if (!res.ok) throw new Error('加载故事失败');
    await assertJson(res, '加载故事失败，请重启本地开发服务（pnpm dev）后重试');
    const data = (await res.json()) as {
      story: Story;
      neighbors?: StoryNeighbors | null;
    };
    let neighbors = data.neighbors ?? null;
    if (!neighbors) {
      neighbors = await fetchStoryNeighbors(id);
    }
    return { story: data.story, neighbors };
  })().finally(() => {
    storyInflight.delete(id);
  });

  storyInflight.set(id, request);
  return request;
}

export async function fetchStoryNeighbors(id: string): Promise<StoryNeighbors | null> {
  const res = await fetch(`/api/stories/${encodeURIComponent(id)}/neighbors`);
  if (res.status === 404) return null;
  if (!res.ok) return null;
  if (!(res.headers.get('content-type') ?? '').includes('application/json')) {
    return null;
  }
  return res.json() as Promise<StoryNeighbors>;
}

export async function fetchBook(sourceText: string): Promise<{
  source_text: string;
  total: number;
  firstId: string | null;
  stories: { id: string; title: string; preview: string }[];
}> {
  const qs = new URLSearchParams({ source: sourceText });
  let res = await fetch(`/api/book?${qs.toString()}`);
  if (
    res.status === 404 ||
    !(res.headers.get('content-type') ?? '').includes('application/json')
  ) {
    res = await fetch(`/api/books/${encodeURIComponent(sourceText)}`);
  }
  await assertJson(res, '书籍接口未就绪，请重启本地开发服务（pnpm dev）后重试');
  if (res.status === 404) throw new Error('未找到该书');
  if (!res.ok) throw new Error('加载书籍失败');
  return res.json() as Promise<{
    source_text: string;
    total: number;
    firstId: string | null;
    stories: { id: string; title: string; preview: string }[];
  }>;
}

async function assertJson(res: Response, message: string) {
  const contentType = res.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    throw new Error(message);
  }
}

export async function requestStoryTranslation(id: string): Promise<string> {
  const res = await fetch(`/api/stories/${encodeURIComponent(id)}/translation`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error('生成译文失败');
  const data = await res.json();
  return data.translation as string;
}

export async function saveStoryTranslation(
  id: string,
  translation: string,
): Promise<string> {
  const res = await fetch(`/api/stories/${encodeURIComponent(id)}/translation`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ translation }),
  });
  if (!res.ok) throw new Error('保存译文失败');
  const data = await res.json();
  return data.translation as string;
}

export async function createStory(input: {
  category: string;
  content: string;
  title?: string;
}): Promise<Story> {
  const res = await fetch('/api/stories', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(
      data.error === 'content_required'
        ? '请输入故事内容'
        : data.error === 'category_required'
          ? '请选择分类'
          : '保存故事失败',
    );
  }
  const data = await res.json();
  return data.story as Story;
}

export async function fetchSources(): Promise<DataSource[]> {
  const res = await fetch('/api/sources');
  if (!res.ok) throw new Error('加载数据源失败');
  const data = await res.json();
  return data.sources as DataSource[];
}
