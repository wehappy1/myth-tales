import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { useSnapshot } from 'valtio/react';
import { fetchStories } from '../lib/api';
import { DEFAULT_HOME_CATEGORY, formatCategory } from '../lib/types';
import { catalogStore } from '../stores/catalog';

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

export function Layout({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const catalog = useSnapshot(catalogStore);
  const q = searchParams.get('q') ?? '';
  const category = searchParams.get('category') ?? undefined;
  const [draft, setDraft] = useState(q);
  const [categories, setCategories] = useState<CategoryStat[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    setDraft(q);
  }, [q]);

  useEffect(() => {
    // 首页无分类参数时，默认进入志怪
    if (
      window.location.pathname === '/' &&
      !searchParams.has('category') &&
      !searchParams.has('q')
    ) {
      navigate(`/?category=${DEFAULT_HOME_CATEGORY}`, { replace: true });
    }
  }, [navigate, searchParams]);

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
    const next = new URLSearchParams();
    const value = (nextQ ?? draft).trim();
    if (value) next.set('q', value);
    if (nextCategory) next.set('category', nextCategory);
    navigate(
      { pathname: '/', search: next.toString() ? `?${next}` : '' },
      { replace },
    );
  }

  function onSearch(event: FormEvent) {
    event.preventDefault();
    goHome(draft, category ?? DEFAULT_HOME_CATEGORY);
  }

  function onCategory(cat: string) {
    // 再次点击当前分类回到默认志怪，而不是「全部分类」
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
            to={`/?category=${DEFAULT_HOME_CATEGORY}`}
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

          {/* <Link to="/new" className="header-new" aria-label="新增故事">
            新增
          </Link> */}

          <button
            type="button"
            className={`category-trigger mobile-only${category ? ' has-filter' : ''}`}
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
            to="/new"
            className="category-drawer-new"
            onClick={() => setDrawerOpen(false)}
          >
            新增故事
          </Link>
        </nav>
      </aside>

      <main className="container">{children}</main>
    </>
  );
}
