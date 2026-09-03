import { WithKeepAlive } from '@/components';
import { Paths } from '@/constants';
import {
  bookPath,
  formatCategory,
  formatTradition,
  resolveHomeCategory,
  storyCardDescription,
} from '@/lib/types';
import { homeStore, loadHomeStories, loadMoreHomeStories } from '@/store';
import {
  Link,
  useActivate,
  useLocation,
  useSearchParams,
  useSnapshot,
} from '@umijs/max';
import { useEffect, useRef } from 'react';
import './index.css';

function IndexPage() {
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const onHome = location.pathname === Paths.INDEX;
  const snap = useSnapshot(homeStore);
  const q = onHome ? (searchParams.get('q') ?? undefined) : snap.q;
  const category = onHome
    ? resolveHomeCategory(searchParams.get('category'))
    : snap.category;
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useActivate(() => {
    document.title = '故事';
  });

  useEffect(() => {
    if (!onHome) return;
    void loadHomeStories(q, category);
  }, [onHome, q, category]);

  useEffect(() => {
    if (!onHome) return;
    const node = sentinelRef.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          void loadMoreHomeStories(q, category);
        }
      },
      { rootMargin: '240px 0px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [onHome, q, category, snap.hasMore, snap.stories.length]);

  if (snap.loading && snap.stories.length === 0) {
    return <p className="page-loading">加载中…</p>;
  }
  if (snap.error && snap.stories.length === 0) {
    return <p className="page-error">{snap.error}</p>;
  }

  return (
    <section className="grid">
      {snap.stories.length === 0 ? (
        <p className="empty">未找到匹配的故事，试试其他关键词。</p>
      ) : (
        <>
          {snap.stories.map((story) => (
            <article key={story.id} className="card">
              <Link
                to={`/story/${encodeURIComponent(story.id)}`}
                className="card-main"
              >
                <h2>{story.title}</h2>
                <p>{storyCardDescription(story)}</p>
              </Link>
              <footer>
                <span className="card-tag">{formatCategory(story.category)}</span>
                <span>{formatTradition(story.tradition)}</span>
                {story.source_text ? (
                  <Link
                    to={bookPath(story.source_text, story.id)}
                    className="card-book"
                  >
                    {story.source_text}
                  </Link>
                ) : null}
              </footer>
            </article>
          ))}
          <div ref={sentinelRef} className="infinite-sentinel" aria-hidden="true" />
          {snap.loadingMore && <p className="infinite-status">加载更多…</p>}
          {!snap.hasMore && snap.stories.length > 0 && (
            <p className="infinite-status">已经到底了</p>
          )}
        </>
      )}
    </section>
  );
}

export default WithKeepAlive(IndexPage, { name: Paths.INDEX });
