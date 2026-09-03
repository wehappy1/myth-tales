import { CATEGORIES, DEFAULT_HOME_CATEGORY } from '@/lib/types';
import { createStory } from '@/lib/api';
import { bumpCatalog, resetHomeStories } from '@/store';
import { history, Link } from '@umijs/max';
import { useEffect, useState, type FormEvent } from 'react';
import './NewStoryPage.css';

const OPTIONS = Object.entries(CATEGORIES).filter(([key]) => key !== 'motif');

export default function NewStoryPage() {
  const [category, setCategory] = useState(DEFAULT_HOME_CATEGORY);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    document.title = '新增故事 · 故事';
    return () => {
      document.title = '故事';
    };
  }, []);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!content.trim()) {
      setError('请输入故事内容');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const story = await createStory({
        category,
        content: content.trim(),
        title: title.trim() || undefined,
      });
      bumpCatalog();
      resetHomeStories();
      history.push(`/story/${story.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="new-story">
      <header className="new-story-head">
        <Link to="/" className="back">
          ← 返回
        </Link>
        <h1>新增故事</h1>
        <p>选择分类，写下内容即可保存。</p>
      </header>

      <form className="new-story-form" onSubmit={onSubmit}>
        <label>
          <span>分类</span>
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            {OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span>标题（可选）</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="不填则取正文前几字"
          />
        </label>

        <label>
          <span>内容</span>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={14}
            placeholder="在此输入故事正文…"
            required
          />
        </label>

        {error && <p className="new-story-error">{error}</p>}

        <button type="submit" disabled={saving}>
          {saving ? '保存中…' : '保存故事'}
        </button>
      </form>
    </section>
  );
}
