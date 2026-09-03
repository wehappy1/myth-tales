import { useEffect, useState } from 'react';
import { Link } from '@umijs/max';
import { saveStoryTranslation } from '../lib/api';
import {
  bookPath,
  formatCategory,
  formatTradition,
  type Story,
  type StoryNeighbors,
} from '../lib/types';
import { StoryNeighborNav } from './StoryNeighborNav';
import '../pages/story/StoryPage.css';

const LANGUAGE_LABELS: Record<string, string> = {
  zh: '中文',
  en: 'English',
  ja: '日本語',
};

function formatLanguage(language?: string | null): string {
  if (!language) return '未知';
  return LANGUAGE_LABELS[language] ?? language.toUpperCase();
}

function translationLabel(language?: string | null) {
  return language === 'en' ? '中文译文' : '白话译文';
}

function splitParagraphs(text: string) {
  return text.split(/\n\n+/).filter(Boolean);
}

type Props = {
  story: Story;
  neighbors: StoryNeighbors | null;
  /** 相邻跳转目标：详情或书籍内 */
  mode: 'story' | 'book';
  onBack: () => void;
  onTranslationChange?: (translation: string) => void;
};

export function StoryReader({
  story,
  neighbors,
  mode,
  onBack,
  onTranslationChange,
}: Props) {
  const [translation, setTranslation] = useState(
    story.translation?.trim() || null,
  );
  const [editorOpen, setEditorOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    setTranslation(story.translation?.trim() || null);
    setEditorOpen(false);
    setSaveError(null);
  }, [story.id, story.translation]);

  useEffect(() => {
    if (!editorOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [editorOpen]);

  function openEditor() {
    setDraft(translation ?? '');
    setSaveError(null);
    setEditorOpen(true);
  }

  async function onSaveTranslation() {
    if (saving) return;
    const next = draft.trim();
    if (!next) {
      setSaveError('译文不能为空');
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const saved = await saveStoryTranslation(story.id, next);
      setTranslation(saved);
      onTranslationChange?.(saved);
      setEditorOpen(false);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  }

  const label = translationLabel(story.language);
  const sourceText = neighbors?.source_text || story.source_text;
  const hrefFor = (id: string) => {
    if (mode === 'book' && sourceText) return bookPath(sourceText, id);
    return `/story/${encodeURIComponent(id)}`;
  };

  return (
    <article className="story">
      <header className="story-meta">
        <button type="button" className="back" onClick={onBack}>
          ← 返回
        </button>
        <p className="meta">
          <span>
            <em>分类</em>
            {formatCategory(story.category)}
          </span>
          <span>
            <em>国家</em>
            {formatTradition(story.tradition)}
          </span>
          <span>
            <em>语言</em>
            {formatLanguage(story.language)}
          </span>
          {sourceText ? (
            <span>
              <em>书籍</em>
              {mode === 'book' ? (
                <span className="meta-book-current">{sourceText}</span>
              ) : (
                <Link to={bookPath(sourceText, story.id)} className="meta-book">
                  {sourceText}
                </Link>
              )}
            </span>
          ) : null}
          {neighbors && neighbors.total > 1 ? (
            <span>
              <em>篇目</em>
              {neighbors.index + 1} / {neighbors.total}
            </span>
          ) : null}
        </p>
      </header>

      <div className="content">
        {splitParagraphs(story.content).map((para, index) => (
          <p key={index}>{para}</p>
        ))}
      </div>

      <section className="translation">
        <div className="translation-head">
          <h2>{label}</h2>
          <button type="button" className="translation-edit" onClick={openEditor}>
            {translation ? '编辑译文' : '填写译文'}
          </button>
        </div>

        {translation ? (
          splitParagraphs(translation).map((para, index) => (
            <p key={index}>{para}</p>
          ))
        ) : (
          <p className="translation-hint">暂无译文，点击右上角填写。</p>
        )}
      </section>

      <StoryNeighborNav
        prev={neighbors?.prev ?? null}
        next={neighbors?.next ?? null}
        hrefFor={hrefFor}
      />

      {editorOpen && (
        <div
          className="translation-modal"
          role="dialog"
          aria-modal="true"
          aria-label={`编辑${label}`}
        >
          <div
            className="translation-modal-backdrop"
            onClick={() => setEditorOpen(false)}
          />
          <div className="translation-modal-panel">
            <header>
              <strong>编辑{label}</strong>
              <button
                type="button"
                aria-label="关闭"
                onClick={() => setEditorOpen(false)}
              >
                ×
              </button>
            </header>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={14}
              placeholder={`在此编辑${label}…`}
            />
            {saveError && <p className="translation-status error">{saveError}</p>}
            <footer>
              <button
                type="button"
                className="ghost"
                onClick={() => setEditorOpen(false)}
              >
                取消
              </button>
              <button type="button" onClick={onSaveTranslation} disabled={saving}>
                {saving ? '保存中…' : '保存'}
              </button>
            </footer>
          </div>
        </div>
      )}
    </article>
  );
}
