import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { storyNeedsChineseTranslation, storyLinePreview } from './src/lib/types';
import { paginateStories } from './src/lib/stories';
import {
  computeDiskStats,
  createDiskStory,
  readAllDiskStories,
  readDiskStoriesBySource,
  readDiskStoryById,
  readDiskStoryNeighbors,
} from './src/lib/local-bank';
import { translateToChinese } from './scripts/lib/google-translate.mjs';

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

function readJsonBody(req: import('http').IncomingMessage): Promise<unknown> {
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

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'myth-tales-local-api',
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
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
              const all = source
                ? readDiskStoriesBySource(source)
                : readAllDiskStories();
              const stats = computeDiskStats(readAllDiskStories());
              const page = paginateStories(all, { q, category, limit, offset });
              res.setHeader('Content-Type', 'application/json; charset=utf-8');
              res.end(
                JSON.stringify({
                  stories: page.stories,
                  hasMore: page.hasMore,
                  totalMatched: page.totalMatched,
                  stats,
                }),
              );
              return;
            }

            if (url.pathname === '/api/stories' && req.method === 'POST') {
              const body = (await readJsonBody(req)) as {
                category?: string;
                content?: string;
                title?: string;
              };
              res.setHeader('Content-Type', 'application/json; charset=utf-8');
              try {
                const story = createDiskStory({
                  category: body.category ?? '',
                  content: body.content ?? '',
                  title: body.title,
                });
                res.statusCode = 201;
                res.end(JSON.stringify({ story }));
              } catch (error) {
                res.statusCode = 400;
                res.end(
                  JSON.stringify({
                    error: error instanceof Error ? error.message : 'bad_request',
                  }),
                );
              }
              return;
            }

            const neighborsMatch = url.pathname.match(
              /^\/api\/stories\/(.+)\/neighbors$/,
            );
            if (neighborsMatch && req.method === 'GET') {
              const id = decodeURIComponent(neighborsMatch[1]);
              const neighbors = readDiskStoryNeighbors(id);
              res.setHeader('Content-Type', 'application/json; charset=utf-8');
              if (!neighbors) {
                res.statusCode = 404;
                res.end(JSON.stringify({ error: 'not_found' }));
                return;
              }
              res.end(JSON.stringify(neighbors));
              return;
            }

            const bookMatch = url.pathname.match(/^\/api\/books\/(.+)$/);
            if (
              (url.pathname === '/api/book' || bookMatch) &&
              req.method === 'GET'
            ) {
              const sourceText = bookMatch
                ? decodeURIComponent(bookMatch[1])
                : (url.searchParams.get('source') ?? '');
              const stories = sourceText
                ? readDiskStoriesBySource(sourceText)
                : [];
              res.setHeader('Content-Type', 'application/json; charset=utf-8');
              if (!sourceText || stories.length === 0) {
                res.statusCode = 404;
                res.end(JSON.stringify({ error: 'not_found' }));
                return;
              }
              res.end(
                JSON.stringify({
                  source_text: sourceText,
                  total: stories.length,
                  firstId: stories[0]?.id ?? null,
                  stories: stories.map((s) => ({
                    id: s.id,
                    title: s.title,
                    preview: storyLinePreview(s),
                  })),
                }),
              );
              return;
            }

            const translationMatch = url.pathname.match(
              /^\/api\/stories\/(.+)\/translation$/,
            );
            if (translationMatch) {
              const id = decodeURIComponent(translationMatch[1]);
              const story = readDiskStoryById(id);
              res.setHeader('Content-Type', 'application/json; charset=utf-8');
              if (!story) {
                res.statusCode = 404;
                res.end(JSON.stringify({ error: 'not_found' }));
                return;
              }

              if (req.method === 'PUT') {
                const body = (await readJsonBody(req)) as { translation?: string };
                const translation = body.translation?.trim() ?? '';
                if (!translation) {
                  res.statusCode = 400;
                  res.end(JSON.stringify({ error: 'empty_translation' }));
                  return;
                }
                writeTranslation(id, translation);
                res.end(JSON.stringify({ translation }));
                return;
              }

              if (req.method === 'POST') {
                const cached = story.translation || readTranslations()[id];
                if (cached) {
                  res.end(JSON.stringify({ translation: cached, cached: true }));
                  return;
                }

                if (!storyNeedsChineseTranslation(story)) {
                  res.statusCode = 400;
                  res.end(JSON.stringify({ error: 'not_needed' }));
                  return;
                }

                const source = story.language === 'en' ? 'en' : 'zh-CN';
                const translation = await translateToChinese(story.content, {
                  source,
                });
                writeTranslation(id, translation);
                res.end(JSON.stringify({ translation, cached: false }));
                return;
              }
            }

            const storyMatch = url.pathname.match(/^\/api\/stories\/(.+)$/);
            if (storyMatch && req.method === 'GET') {
              const id = decodeURIComponent(storyMatch[1]);
              // 排除误匹配 /translation、/neighbors 子路径
              if (id.includes('/')) {
                next();
                return;
              }
              const story = readDiskStoryById(id);
              res.setHeader('Content-Type', 'application/json; charset=utf-8');
              if (!story) {
                res.statusCode = 404;
                res.end(JSON.stringify({ error: 'not_found' }));
                return;
              }
              const neighbors = readDiskStoryNeighbors(id);
              res.end(JSON.stringify({ story, neighbors }));
              return;
            }

            if (url.pathname === '/api/sources') {
              const { default: sources } = await import('./data/sources.json');
              res.setHeader('Content-Type', 'application/json; charset=utf-8');
              res.end(JSON.stringify({ sources }));
              return;
            }

            next();
          } catch (error) {
            console.error(error);
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(JSON.stringify({ error: 'internal_error' }));
          }
        });
      },
    },
  ],
  server: {
    port: 4321,
  },
});
