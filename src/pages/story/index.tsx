import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { StoryReader } from '../../components/StoryReader';
import { fetchStoryWithNeighbors } from '../../lib/api';
import type { Story, StoryNeighbors } from '../../lib/types';
import './StoryPage.css';

export function StoryPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const [story, setStory] = useState<Story | null>(null);
  const [neighbors, setNeighbors] = useState<StoryNeighbors | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [id]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchStoryWithNeighbors(id)
      .then(({ story: data, neighbors: nextNeighbors }) => {
        if (cancelled) return;
        if (!data) {
          navigate('/', { replace: true });
          return;
        }
        setStory(data);
        setNeighbors(nextNeighbors);
        document.title = `${data.title} · 故事`;
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      document.title = '故事';
    };
  }, [id, navigate]);

  function goBack() {
    if (window.history.length > 1) {
      navigate(-1);
      return;
    }
    navigate('/');
  }

  if (loading) return <p className="page-loading">加载中…</p>;
  if (error) return <p className="page-error">{error}</p>;
  if (!story) return null;

  return (
    <StoryReader
      story={story}
      neighbors={neighbors}
      mode="story"
      onBack={goBack}
      onTranslationChange={(translation) => {
        setStory((prev) => (prev ? { ...prev, translation } : prev));
      }}
    />
  );
}
