import { Link } from 'react-router-dom';
import type { StoryNeighbor } from '../lib/types';
import './StoryNeighborNav.css';

type Props = {
  prev: StoryNeighbor | null;
  next: StoryNeighbor | null;
  hrefFor: (id: string) => string;
};

export function StoryNeighborNav({ prev, next, hrefFor }: Props) {
  if (!prev && !next) return null;

  return (
    <nav className="story-nav" aria-label="相邻故事">
      {prev ? (
        <Link to={hrefFor(prev.id)} className="story-nav-link prev">
          <span className="story-nav-dir">←</span>
          <span className="story-nav-preview">{prev.preview}</span>
        </Link>
      ) : (
        <span className="story-nav-link placeholder" aria-hidden="true" />
      )}
      {next ? (
        <Link to={hrefFor(next.id)} className="story-nav-link next">
          <span className="story-nav-preview">{next.preview}</span>
          <span className="story-nav-dir">→</span>
        </Link>
      ) : (
        <span className="story-nav-link placeholder" aria-hidden="true" />
      )}
    </nav>
  );
}
