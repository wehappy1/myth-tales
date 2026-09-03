import { StoryReader } from '@/components/StoryReader';
import { fetchBook, fetchStoryWithNeighbors } from '@/lib/api';
import {
  bookPath,
  decodeBookKey,
  type Story,
  type StoryNeighbors,
} from '@/lib/types';
import { history, useParams } from '@umijs/max';
import { useEffect, useState } from 'react';
import '../../story/StoryPage.css';
import '../BookPage.css';

export default function BookPage() {
  const { sourceKey = '', storyId } = useParams();
  const sourceText = decodeBookKey(sourceKey);
  const [story, setStory] = useState<Story | null>(null);
  const [neighbors, setNeighbors] = useState<StoryNeighbors | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [sourceKey, storyId]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        if (!storyId) {
          const book = await fetchBook(sourceText);
          if (cancelled) return;
          if (!book.firstId) {
            history.replace('/');
            return;
          }
          history.replace(bookPath(sourceText, book.firstId));
          return;
        }

        const { story: data, neighbors: nextNeighbors } =
          await fetchStoryWithNeighbors(storyId);
        if (cancelled) return;
        if (!data) {
          history.replace('/');
          return;
        }
        if (data.source_text && data.source_text !== sourceText) {
          history.replace(bookPath(data.source_text, data.id));
          return;
        }
        setStory(data);
        setNeighbors(nextNeighbors);
        document.title = `${sourceText} · 故事`;
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : '加载失败');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
      document.title = '故事';
    };
  }, [sourceKey, sourceText, storyId]);

  function goBack() {
    if (window.history.length > 1) {
      history.back();
      return;
    }
    history.push('/');
  }

  if (loading || (!storyId && !error)) {
    return <p className="page-loading">加载中…</p>;
  }
  if (error) return <p className="page-error">{error}</p>;
  if (!story) return null;

  return (
    <div className="book-page">
      <p className="book-banner">
        <span className="book-banner-label">正在阅读</span>
        <strong>{sourceText}</strong>
        {neighbors && neighbors.total > 0 ? (
          <span className="book-banner-count">
            第 {neighbors.index + 1} / {neighbors.total} 则
          </span>
        ) : null}
      </p>
      <StoryReader
        story={story}
        neighbors={neighbors}
        mode="book"
        onBack={goBack}
        onTranslationChange={(translation) => {
          setStory((prev) => (prev ? { ...prev, translation } : prev));
        }}
      />
    </div>
  );
}
