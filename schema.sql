-- 神话与民间传说故事库 schema（Cloudflare D1 / SQLite）

CREATE TABLE IF NOT EXISTS sources (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  url TEXT,
  license TEXT,
  language TEXT,
  description TEXT,
  fetched_at TEXT
);

CREATE TABLE IF NOT EXISTS stories (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  translation TEXT,
  summary TEXT,
  category TEXT NOT NULL,
  tradition TEXT,
  region TEXT,
  source_id TEXT REFERENCES sources(id),
  source_text TEXT,
  reference TEXT,
  tags TEXT,
  language TEXT DEFAULT 'zh',
  license TEXT,
  external_url TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_stories_category ON stories(category);
CREATE INDEX IF NOT EXISTS idx_stories_tradition ON stories(tradition);
CREATE INDEX IF NOT EXISTS idx_stories_language ON stories(language);
CREATE INDEX IF NOT EXISTS idx_stories_source ON stories(source_id);
CREATE INDEX IF NOT EXISTS idx_stories_source_text ON stories(source_text);
CREATE INDEX IF NOT EXISTS idx_stories_updated ON stories(updated_at);

CREATE VIRTUAL TABLE IF NOT EXISTS stories_fts USING fts5(
  title,
  content,
  summary,
  tags,
  translation,
  content='stories',
  content_rowid='rowid'
);

CREATE TRIGGER IF NOT EXISTS stories_ai AFTER INSERT ON stories BEGIN
  INSERT INTO stories_fts(rowid, title, content, summary, tags, translation)
  VALUES (new.rowid, new.title, new.content, new.summary, new.tags, new.translation);
END;

CREATE TRIGGER IF NOT EXISTS stories_ad AFTER DELETE ON stories BEGIN
  INSERT INTO stories_fts(stories_fts, rowid, title, content, summary, tags, translation)
  VALUES ('delete', old.rowid, old.title, old.content, old.summary, old.tags, old.translation);
END;

CREATE TRIGGER IF NOT EXISTS stories_au AFTER UPDATE ON stories BEGIN
  INSERT INTO stories_fts(stories_fts, rowid, title, content, summary, tags, translation)
  VALUES ('delete', old.rowid, old.title, old.content, old.summary, old.tags, old.translation);
  INSERT INTO stories_fts(rowid, title, content, summary, tags, translation)
  VALUES (new.rowid, new.title, new.content, new.summary, new.tags, new.translation);
END;
