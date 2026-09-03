import { resolve } from 'path';
import { defineConfig } from 'umi';

export default defineConfig({
  npmClient: 'pnpm',
  title: '故事',
  history: { type: 'browser' },
  alias: {
    '@': resolve(__dirname, './src'),
  },
  valtio: {},
  plugins: [
    require.resolve('./plugin/umi-plugin-local-api'),
    'umi-plugin-keep-alive',
  ],
  conventionRoutes: {
    exclude: [/\/components\//],
  },
  metas: [
    {
      name: 'description',
      content: '中外神话、民间传说与志怪故事数字图书馆',
    },
  ],
  links: [
    { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
    { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossOrigin: true },
  ],
  styles: [
    'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,600;1,400&family=Noto+Serif+SC:wght@400;600&display=swap',
  ],
});
