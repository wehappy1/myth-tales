import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { IApi } from 'umi';
import { paginateStories } from '../src/lib/stories';
import { storyLinePreview, storyNeedsChineseTranslation } from '../src/lib/types';
import {
  computeDiskStats,
  createDiskStory,
  readAllDiskStories,
  readDiskStoriesBySource,
  readDiskStoryById,
  readDiskStoryNeighbors,
} from '../src/lib/local-bank';

const translationsPath = join(process.cwd(), 'data/imported/translations.json');

function readTranslations(): Record<string, string> {
  if (!existsSync(translationsPath)) return {};
  return JSON.parse(readFileSync(translationsPath, 'utf-8'));
}

function writeTranslation(id: string, translation: string) {
  const map = readTranslations();
  map[id] = translation;
  writeFileSync(translationsPath, `${JSON.stringify(map, null, 2)}\n`);
}

function readJsonBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf-8');
        resolve(raw ? JSON.parse(raw) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });
}

function json(res: ServerResponse, body: unknown, status = 200) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

export default (api: IApi) => {
  api.describe({ key: 'localApi' });

  api.addBeforeMiddlewares(() => {
    return async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
      try {
        const url = new URL(req.url ?? '/', 'http://localhost');
        if (!url.pathname.startsWith('/api/')) {
          next();
          return;
        }

        if (url.pathname === '/api/stories' && req.method === 'GET') {
          const q = url.searchParams.get('q') ?? undefined;
          const category = url.searchParams.get('category') ?? undefined;
          const source = url.searchParams.get('source') ?? undefined;
          const limit = Number(url.searchParams.get('limit') ?? '24');
          const offset = Number(url.searchParams.get('offset') ?? '0');
          const wantStats = url.searchParams.get('stats') !== '0';
          const all = source
            ? readDiskStoriesBySource(source)
            : readAllDiskStories();
          const stats = wantStats
            ? computeDiskStats(readAllDiskStories())
            : { total: 0, byCategory: [] as { category: string; count: number }[] };
          const page = paginateStories(all, { q, category, limit, offset });
          json(res, {
            stories: page.stories,
            hasMore: page.hasMore,
            totalMatched: page.totalMatched,
            stats,
          });
          return;
        }

        if (url.pathname === '/api/stories' && req.method === 'POST') {
          const body = (await readJsonBody(req)) as {
            category?: string;
            content?: string;
            title?: string;
          };
          try {
            const story = createDiskStory({
              category: body.category ?? '',
              content: body.content ?? '',
              title: body.title,
            });
            json(res, { story }, 201);
          } catch (error) {
            json(
              res,
              { error: error instanceof Error ? error.message : 'bad_request' },
              400,
            );
          }
          return;
        }

        const neighborsMatch = url.pathname.match(/^\/api\/stories\/(.+)\/neighbors$/);
        if (neighborsMatch && req.method === 'GET') {
          const id = decodeURIComponent(neighborsMatch[1]);
          const neighbors = readDiskStoryNeighbors(id);
          if (!neighbors) {
            json(res, { error: 'not_found' }, 404);
            return;
          }
          json(res, neighbors);
          return;
        }

        const bookMatch = url.pathname.match(/^\/api\/books\/(.+)$/);
        if ((url.pathname === '/api/book' || bookMatch) && req.method === 'GET') {
          const sourceText = bookMatch
            ? decodeURIComponent(bookMatch[1])
            : (url.searchParams.get('source') ?? '');
          const stories = sourceText ? readDiskStoriesBySource(sourceText) : [];
          if (!sourceText || stories.length === 0) {
            json(res, { error: 'not_found' }, 404);
            return;
          }
          json(res, {
            source_text: sourceText,
            total: stories.length,
            firstId: stories[0]?.id ?? null,
            stories: stories.map((s) => ({
              id: s.id,
              title: s.title,
              preview: storyLinePreview(s),
            })),
          });
          return;
        }

        const translationMatch = url.pathname.match(
          /^\/api\/stories\/(.+)\/translation$/,
        );
        if (translationMatch) {
          const id = decodeURIComponent(translationMatch[1]);
          const story = readDiskStoryById(id);
          if (!story) {
            json(res, { error: 'not_found' }, 404);
            return;
          }

          if (req.method === 'PUT') {
            const body = (await readJsonBody(req)) as { translation?: string };
            const translation = body.translation?.trim() ?? '';
            if (!translation) {
              json(res, { error: 'empty_translation' }, 400);
              return;
            }
            writeTranslation(id, translation);
            json(res, { translation });
            return;
          }

          if (req.method === 'POST') {
            const cached = story.translation || readTranslations()[id];
            if (cached) {
              json(res, { translation: cached, cached: true });
              return;
            }
            if (!storyNeedsChineseTranslation(story)) {
              json(res, { error: 'not_needed' }, 400);
              return;
            }
            const { translateToChinese } = await import(
              '../scripts/lib/google-translate.mjs'
            );
            const source = story.language === 'en' ? 'en' : 'zh-CN';
            const translation = await translateToChinese(story.content, { source });
            writeTranslation(id, translation);
            json(res, { translation, cached: false });
            return;
          }
        }

        const storyMatch = url.pathname.match(/^\/api\/stories\/(.+)$/);
        if (storyMatch && req.method === 'GET') {
          const id = decodeURIComponent(storyMatch[1]);
          if (id.includes('/')) {
            next();
            return;
          }
          const story = readDiskStoryById(id);
          if (!story) {
            json(res, { error: 'not_found' }, 404);
            return;
          }
          json(res, { story, neighbors: readDiskStoryNeighbors(id) });
          return;
        }

        if (url.pathname === '/api/sources') {
          const { default: sources } = await import('../data/sources.json');
          json(res, { sources });
          return;
        }

        next();
      } catch (error) {
        console.error(error);
        json(res, { error: 'internal_error' }, 500);
      }
    };
  });
};
