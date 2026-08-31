/// <reference types="@cloudflare/workers-types" />

import { Hono } from 'hono';
import {
  getStoriesBySourceFromDb,
  getStoriesFromDb,
  getStoryByIdFromDb,
  getStoryNeighborsFromDb,
  getStoryStatsFromDb,
} from '../src/lib/stories-db';
import {
  isExcludedStory,
  storyLinePreview,
  storyNeedsChineseTranslation,
} from '../src/lib/types';
import sources from '../data/sources.json';

type Env = {
  Bindings: {
    DB: D1Database;
    ASSETS: Fetcher;
  };
};

async function translateToChinese(text: string, source = 'autodetect') {
  const src =
    source === 'en' ? 'en' : source === 'zh-CN' || source === 'zh' ? 'zh-CN' : 'autodetect';
  const maxLen = 450;
  const chunks: string[] = [];
  let rest = text.replace(/\r\n/g, '\n').trim();
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

  async function translateChunk(chunk: string, from: string, to: string) {
    const url = new URL('https://api.mymemory.translated.net/get');
    url.searchParams.set('q', chunk);
    url.searchParams.set('langpair', `${from}|${to}`);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`translate_http_${res.status}`);
    const data = (await res.json()) as {
      responseStatus: number;
      responseData?: { translatedText?: string };
      responseDetails?: string;
    };
    const translated = data.responseData?.translatedText;
    if (!translated || data.responseStatus !== 200) {
      throw new Error(data.responseDetails || 'translate_empty');
    }
    return translated;
  }

  const parts: string[] = [];
  for (const chunk of chunks) {
    if (src === 'zh-CN') {
      const english = await translateChunk(chunk, 'zh-CN', 'en');
      parts.push(await translateChunk(english, 'en', 'zh-CN'));
    } else {
      parts.push(await translateChunk(chunk, src, 'zh-CN'));
    }
  }
  return parts.join('');
}

const app = new Hono<Env>();

app.get('/api/stories', async (c) => {
  const q = c.req.query('q') ?? undefined;
  const category = c.req.query('category') ?? undefined;
  const limit = Number(c.req.query('limit') ?? '24');
  const offset = Number(c.req.query('offset') ?? '0');

  try {
    const [rows, stats] = await Promise.all([
      getStoriesFromDb(c.env.DB, {
        q,
        category,
        limit: limit + 1,
        offset,
      }),
      getStoryStatsFromDb(c.env.DB),
    ]);
    const filtered = rows.filter((s) => !isExcludedStory(s));
    const hasMore = filtered.length > limit;
    const stories = filtered.slice(0, limit);
    return c.json({ stories, hasMore, stats });
  } catch (error) {
    console.error(error);
    return c.json({ error: 'database_unavailable' }, 503);
  }
});

app.get('/api/stories/:id/neighbors', async (c) => {
  try {
    const story = await getStoryByIdFromDb(c.env.DB, c.req.param('id'));
    if (!story || isExcludedStory(story)) return c.json({ error: 'not_found' }, 404);
    const neighbors = await getStoryNeighborsFromDb(c.env.DB, story.id);
    if (!neighbors) return c.json({ error: 'not_found' }, 404);
    return c.json(neighbors);
  } catch (error) {
    console.error(error);
    return c.json({ error: 'database_unavailable' }, 503);
  }
});

app.get('/api/stories/:id', async (c) => {
  try {
    const story = await getStoryByIdFromDb(c.env.DB, c.req.param('id'));
    if (!story || isExcludedStory(story)) return c.json({ error: 'not_found' }, 404);
    const neighbors = await getStoryNeighborsFromDb(c.env.DB, story.id);
    return c.json({ story, neighbors });
  } catch (error) {
    console.error(error);
    return c.json({ error: 'database_unavailable' }, 503);
  }
});

app.get('/api/book', async (c) => {
  try {
    const sourceText = c.req.query('source') ?? '';
    if (!sourceText) return c.json({ error: 'not_found' }, 404);
    const stories = (await getStoriesBySourceFromDb(c.env.DB, sourceText)).filter(
      (s) => !isExcludedStory(s),
    );
    if (stories.length === 0) return c.json({ error: 'not_found' }, 404);
    return c.json({
      source_text: sourceText,
      total: stories.length,
      firstId: stories[0]?.id ?? null,
      stories: stories.map((s) => ({
        id: s.id,
        title: s.title,
        preview: storyLinePreview(s),
      })),
    });
  } catch (error) {
    console.error(error);
    return c.json({ error: 'database_unavailable' }, 503);
  }
});

app.get('/api/books/:sourceKey', async (c) => {
  try {
    const sourceText = decodeURIComponent(c.req.param('sourceKey'));
    const stories = (await getStoriesBySourceFromDb(c.env.DB, sourceText)).filter(
      (s) => !isExcludedStory(s),
    );
    if (stories.length === 0) return c.json({ error: 'not_found' }, 404);
    return c.json({
      source_text: sourceText,
      total: stories.length,
      firstId: stories[0]?.id ?? null,
      stories: stories.map((s) => ({
        id: s.id,
        title: s.title,
        preview: storyLinePreview(s),
      })),
    });
  } catch (error) {
    console.error(error);
    return c.json({ error: 'database_unavailable' }, 503);
  }
});

app.post('/api/stories/:id/translation', async (c) => {
  try {
    const id = c.req.param('id');
    const story = await getStoryByIdFromDb(c.env.DB, id);
    if (!story) return c.json({ error: 'not_found' }, 404);
    if (story.translation?.trim()) {
      return c.json({ translation: story.translation, cached: true });
    }
    if (!storyNeedsChineseTranslation(story)) {
      return c.json({ error: 'not_needed' }, 400);
    }

    const source = story.language === 'en' ? 'en' : 'zh-CN';
    const translation = await translateToChinese(story.content, source);
    await c.env.DB.prepare(
      "UPDATE stories SET translation = ?, updated_at = datetime('now') WHERE id = ?",
    )
      .bind(translation, id)
      .run();

    return c.json({ translation, cached: false });
  } catch (error) {
    console.error(error);
    return c.json({ error: 'translate_failed' }, 500);
  }
});

app.put('/api/stories/:id/translation', async (c) => {
  try {
    const id = c.req.param('id');
    const story = await getStoryByIdFromDb(c.env.DB, id);
    if (!story) return c.json({ error: 'not_found' }, 404);

    const body = await c.req.json<{ translation?: string }>();
    const translation = body.translation?.trim() ?? '';
    if (!translation) return c.json({ error: 'empty_translation' }, 400);

    await c.env.DB.prepare(
      "UPDATE stories SET translation = ?, updated_at = datetime('now') WHERE id = ?",
    )
      .bind(translation, id)
      .run();

    return c.json({ translation });
  } catch (error) {
    console.error(error);
    return c.json({ error: 'save_failed' }, 500);
  }
});

app.get('/api/sources', (c) => c.json({ sources }));

app.all('*', (c) => c.env.ASSETS.fetch(c.req.raw));

export default app;
