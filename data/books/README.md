# 古籍 JSON 数据源

将 [chinese-ancient-text](https://github.com/hanzhaodeng/chinese-ancient-text) 等格式的 JSON 文件放入此目录，运行导入命令即可生成故事库。

## 使用步骤

1. 从 GitHub 下载所需书籍 JSON，例如：
   - `搜神记.json`
   - `山海经.json`
   - `列子.json`
2. 复制到本目录 `data/books/`
3. （可选）在 `_meta.json` 中为某本书补充分类、许可等信息
4. 执行导入：

```bash
pnpm import:books
pnpm dev
```

导入结果写入 `data/imported/stories.json`，本地开发与 D1 seed 均会使用。

## JSON 格式要求

兼容 `chinese-ancient-text` 结构：

```json
{
  "name": "搜神记",
  "description": "书籍简介（可选）",
  "articles": [
    {
      "title": "卷一",
      "content": [
        "第一段故事正文……",
        "第二段故事正文……"
      ]
    }
  ]
}
```

- `articles[].content` 中**每一段**会拆成一篇独立故事
- 也支持 `content` 为单个字符串

## 推荐书目（神话 / 志怪 / 传说）

| 文件名 | 说明 |
|--------|------|
| 搜神记.json | 志怪小说，数百则 |
| 山海经.json | 神话地理 |
| 淮南子.json | 神话哲学 |
| 列子.json | 神话寓言 |
| 吕氏春秋.json | 含神话片段 |
| 世说新语.json | 轶事传说 |
| 笑林广记.json | 民间笑话 |

## 文件命名

- 使用 `.json` 后缀（古籍）
- `aft.csv`（Ashliman）也可放在本目录或 `data/raw/`，用 `pnpm import:aft` 导入
- 以 `_` 开头的文件（如 `_meta.json`）会被跳过
- 子目录中的 JSON 也会递归扫描
