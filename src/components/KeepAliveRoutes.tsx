import { useLocation, matchPath, Routes, Route } from 'react-router-dom';
import type { ReactNode } from 'react';
import { HomePage } from '../pages/home';
import { StoryPage } from '../pages/story';
import { NewStoryPage } from '../pages/new';
import { BookPage } from '../pages/book';
import './KeepAliveRoutes.css';

/**
 * 首页 KeepAlive：进详情时首页不卸载，仅隐藏，保留 DOM / 状态 / 滚动。
 * 详情页仍走常规路由挂载。
 */
export function KeepAliveRoutes() {
  const location = useLocation();
  const onHome = location.pathname === '/';
  const onStory = Boolean(matchPath('/story/:id', location.pathname));
  const onNew = location.pathname === '/new';
  const onBook = Boolean(
    matchPath('/book/:sourceKey', location.pathname) ||
      matchPath('/book/:sourceKey/:storyId', location.pathname),
  );

  return (
    <>
      <div
        className="keepalive-pane"
        hidden={!onHome}
        aria-hidden={!onHome}
      >
        <HomePage active={onHome} />
      </div>

      {onStory || onNew || onBook ? (
        <Routes>
          <Route path="/story/:id" element={<StoryPage />} />
          <Route path="/new" element={<NewStoryPage />} />
          <Route path="/book/:sourceKey/:storyId" element={<BookPage />} />
          <Route path="/book/:sourceKey" element={<BookPage />} />
        </Routes>
      ) : null}

      {!onHome && !onStory && !onNew && !onBook ? (
        <Routes>
          <Route path="*" element={<HomeFallback />} />
        </Routes>
      ) : null}
    </>
  );
}

function HomeFallback(): ReactNode {
  return null;
}
