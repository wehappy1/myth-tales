import { Paths } from '@/constants';
import { fetchStories } from '@/lib/api';
import {
  DEFAULT_HOME_CATEGORY,
  formatCategory,
  homePath,
  resolveHomeCategory,
} from '@/lib/types';
import { catalogStore, homeStore } from '@/store';
import {
  history,
  Link,
  Outlet,
  useLocation,
  useSearchParams,
  useSnapshot,
} from '@umijs/max';
import { useEffect, useState, type FormEvent } from 'react';

type CategoryStat = { category: string; count: number };

function CategoryIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 6h16M4 12h16M4 18h10"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default function Layouts() {
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const catalog = useSnapshot(catalogStore);
  const home = useSnapshot(homeStore);
  const onHome = location.pathname === Paths.INDEX;
  const q = onHome ? (searchParams.get('q') ?? '') : (home.q ?? '');
  const category = onHome
    ? resolveHomeCategory(searchParams.get('category'))
    : home.category;
  const [draft, setDraft] = useState(q);
  const [categories, setCategories] = useState<CategoryStat[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    if (!onHome) return;
    setDraft(searchParams.get('q') ?? '');
  }, [onHome, searchParams]);

  useEffect(() => {
    let cancelled = false;
    fetchStories({ limit: 1 })
      .then((data) => {
        if (!cancelled) setCategories(data.stats.byCategory);
      })
      .catch(() => {
        if (!cancelled) setCategories([]);
      });
    return () => {
      cancelled = true;
    };
  }, [catalog.version]);

  useEffect(() => {
    if (!drawerOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [drawerOpen]);

  function goHome(nextQ?: string, nextCategory?: string, replace = false) {
    const href = homePath(nextQ ?? draft, nextCategory);
    if (replace) {
      history.replace(href);
      return;
    }
    history.push(href);
  }

  function onSearch(event: FormEvent) {
    event.preventDefault();
    goHome(draft, category);
  }

  function onCategory(cat: string) {
    goHome(q, category === cat ? DEFAULT_HOME_CATEGORY : cat, true);
    setDrawerOpen(false);
  }

  const categoryButtons = categories.map(({ category: cat, count }) => (
    <button
      key={cat}
      type="button"
      className={category === cat ? 'active' : undefined}
      onClick={() => onCategory(cat)}
    >
      {formatCategory(cat)}
      <span>{count}</span>
    </button>
  ));

  return (
    <>
      <div className="grain" aria-hidden="true" />
      <header className="site-header sticky-header">
        <div className="header-bar">
          <Link
            to={Paths.INDEX}
            className="logo"
            onClick={() => setDraft('')}
          >
            故事
          </Link>

          <form className="header-search" onSubmit={onSearch}>
            <input
              type="search"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="搜索故事…"
              aria-label="搜索故事"
            />
            <button type="submit">搜索</button>
          </form>

          <nav className="header-categories desktop-only" aria-label="分类">
            {categoryButtons}
          </nav>

          <button
            type="button"
            className={`category-trigger mobile-only${
              category !== DEFAULT_HOME_CATEGORY ? ' has-filter' : ''
            }`}
            aria-label="打开分类"
            aria-expanded={drawerOpen}
            onClick={() => setDrawerOpen(true)}
          >
            <CategoryIcon />
          </button>
        </div>
      </header>

      <div
        className={`category-drawer-backdrop${drawerOpen ? ' open' : ''}`}
        onClick={() => setDrawerOpen(false)}
        aria-hidden={!drawerOpen}
      />
      <aside
        className={`category-drawer${drawerOpen ? ' open' : ''}`}
        aria-hidden={!drawerOpen}
        aria-label="分类筛选"
      >
        <div className="category-drawer-head">
          <strong>分类</strong>
          <button type="button" aria-label="关闭" onClick={() => setDrawerOpen(false)}>
            ×
          </button>
        </div>
        <nav className="category-drawer-list">
          {categoryButtons}
          <Link
            to={Paths.NEW}
            className="category-drawer-new"
            onClick={() => setDrawerOpen(false)}
          >
            新增故事
          </Link>
        </nav>
      </aside>

      <main className="container">
        <Outlet />
      </main>
    </>
  );
}
