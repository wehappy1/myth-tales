# Myth Tales · 神话与民间传说

汇集中外神话、志怪与民间故事的数字图书馆。

- 前端：**Umi Max + React**（`umi-plugin-keep-alive` 缓存首页）
- API：**Hono**（Cloudflare Workers）
- 数据：**Cloudflare D1**（主库）+ 本地 JSON（开发回退）

## 快速开始

```bash
cd myth-tales
pnpm install
pnpm import:books   # 若 data/books/ 有书籍
pnpm dev            # http://localhost:4321
```

本地开发通过 Umi 中间件提供 `/api/*`，直接读 `data/imported/stories.json`，无需 Cloudflare 账号。

首页默认展示「志怪」，URL 不带 `?category=creature`。从详情返回首页走 KeepAlive，不重新拉列表。

## Cloudflare 免费版

| 服务 | 免费额度 | 本项目用途 |
|------|----------|------------|
| **D1** | 5 GB 存储，500 万行读/天 | 故事主库 + FTS |
| **R2** | 10 GB，出站免费 | 原始 JSON 归档 |
| **Workers + Assets** | 免费托管 | React 前端 + API |
| **KV** | 1 GB | 可选缓存 |

### 部署

```bash
pnpm exec wrangler login
pnpm exec wrangler d1 create myth-tales-db
# 把 database_id 填入 wrangler.toml

pnpm db:init
pnpm db:seed
pnpm exec wrangler d1 execute myth-tales-db --remote --file=./schema.sql
pnpm exec wrangler d1 execute myth-tales-db --remote --file=./seed-data.sql

pnpm deploy
```

## 导入书籍

把 [chinese-ancient-text](https://github.com/hanzhaodeng/chinese-ancient-text) 等 JSON 放入 `data/books/`，然后：

```bash
pnpm import:books
```

## 项目结构

```
myth-tales/
├── src/                 # Umi 前端（约定式路由）
│   ├── pages/           # 页面
│   ├── layouts/         # 全局布局
│   ├── store/           # valtio store（@umijs/max）
│   └── components/
├── plugin/              # 本地 /api 中间件
├── worker/              # Hono API（生产环境读 D1）
├── data/books/          # 放入古籍 JSON
├── data/imported/       # import:books 输出
├── schema.sql           # D1 表结构
└── wrangler.toml
```

## API

```
GET /api/stories?q=女娲&category=myth&limit=24
GET /api/stories/:id
GET /api/sources
```
