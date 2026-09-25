import { ChevronDown, ChevronRight, LogOut, Menu, PanelLeftClose, PanelLeftOpen, Plus, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:4100';

export type NavItem = {
  to: string;
  label: string;
  end?: boolean;
  icon: LucideIcon;
  hidden?: boolean;
};

function resolveActiveTitle(titleItems: NavItem[], pathname: string) {
  const exact = titleItems.find((item) => item.end && item.to === pathname);
  if (exact) return exact.label;
  const prefixMatches = titleItems
    .filter((item) => !item.end && pathname.startsWith(item.to))
    .sort((a, b) => b.to.length - a.to.length);
  return prefixMatches[0]?.label || 'Overview';
}

export function AppShell({ navItems, titleItems, eyebrow }: { navItems: NavItem[]; titleItems?: NavItem[]; eyebrow: string }) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => window.localStorage.getItem('thinkplus-admin-sidebar-collapsed') === 'true');
  const avatarUrl = user?.avatar ? `${API_BASE}${user.avatar.imageUrl}` : null;
  const pageTitle = resolveActiveTitle(titleItems || navItems, location.pathname);

  useEffect(() => {
    window.localStorage.setItem('thinkplus-admin-sidebar-collapsed', String(sidebarCollapsed));
  }, [sidebarCollapsed]);

  useEffect(() => {
    if (!menuOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [menuOpen]);

  const renderNav = (items: NavItem[]) => items.map((item) => (
    <NavLink
      className={({ isActive }) => `app-nav__link ${isActive ? 'active' : ''}`}
      end={item.end}
      key={item.to}
      onClick={() => setMenuOpen(false)}
      title={sidebarCollapsed ? item.label : undefined}
      to={item.to}
      aria-label={sidebarCollapsed ? item.label : undefined}
    >
      <item.icon aria-hidden="true" size={18} strokeWidth={1.9} />
      <span>{item.label}</span>
      <ChevronRight aria-hidden="true" className="app-nav__chevron" size={15} />
    </NavLink>
  ));

  return (
    <div className={`app-shell admin-shell ${sidebarCollapsed ? 'admin-shell--collapsed' : ''}`}>
      {menuOpen ? <button aria-label="Close navigation" className="admin-nav-scrim" onClick={() => setMenuOpen(false)} type="button" /> : null}
      <aside className={`app-sidebar ${menuOpen ? 'app-sidebar--open' : ''}`} id="admin-navigation">
        <div className="admin-sidebar__brand-row">
          <Link aria-label="Think Plus overview" className="app-sidebar__brand" onClick={() => setMenuOpen(false)} to="/admin">
            <img alt="Think Plus" className="app-sidebar__logo" src="/thinkplus-logo.png" />
            <span className="admin-sidebar__brand-mark" aria-hidden="true">T<span>+</span></span>
            <span className="app-sidebar__eyebrow">{eyebrow}</span>
          </Link>
          <button
            aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-pressed={sidebarCollapsed}
            className="admin-sidebar__collapse"
            onClick={() => setSidebarCollapsed((collapsed) => !collapsed)}
            title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            type="button"
          >{sidebarCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}</button>
        </div>

        <div className="admin-sidebar__content">
          <div className="admin-sidebar__group">
            <span className="admin-sidebar__group-label">Workspace</span>
            <nav aria-label="Admin workspace" className="app-nav">{renderNav(navItems.slice(0, 4))}</nav>
          </div>
          <div className="admin-sidebar__group">
            <span className="admin-sidebar__group-label">Performance</span>
            <nav aria-label="Performance" className="app-nav">{renderNav(navItems.slice(4))}</nav>
          </div>
        </div>

        <div className="admin-sidebar__bottom">
          <div className="admin-sidebar__help">
            <span className="admin-sidebar__help-icon">✦</span>
            <strong>Ready for your next test?</strong>
            <p>Create a test from an approved question bank.</p>
            <Link onClick={() => setMenuOpen(false)} to="/admin/tests">Create test <ChevronRight size={15} /></Link>
          </div>
          <div className="app-sidebar__account">
            <Link className="app-sidebar__user" onClick={() => setMenuOpen(false)} to="/admin/profile">
              {avatarUrl ? <img alt="" className="avatar-chip" src={avatarUrl} /> : <span className="avatar-chip avatar-chip--placeholder">{user?.name?.[0]?.toUpperCase() || 'A'}</span>}
              <span className="app-sidebar__user-info"><strong>{user?.name || 'Administrator'}</strong><span>Administrator</span></span>
              <ChevronDown aria-hidden="true" size={15} />
            </Link>
            <button aria-label="Sign out" className="app-sidebar__logout" onClick={logout} title="Sign out" type="button"><LogOut size={17} /></button>
          </div>
        </div>
      </aside>

      <div className="app-main">
        <header className="app-header">
          <div className="app-header__location">
            <button aria-controls="admin-navigation" aria-expanded={menuOpen} aria-label={menuOpen ? 'Close menu' : 'Open menu'} className="admin-menu-button" onClick={() => setMenuOpen((open) => !open)} type="button">
              {menuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
            <span className="app-header__parent">Admin workspace</span>
            <ChevronRight aria-hidden="true" size={15} />
            <strong>{pageTitle}</strong>
          </div>
          <div className="app-header__right">
            <span className="admin-header__status"><span /> Workspace active</span>
            <Link className="admin-header__create" to="/admin/tests"><Plus size={16} /> <span>Create test</span></Link>
            <Link aria-label="Your profile" className="admin-header__avatar" to="/admin/profile">
              {avatarUrl ? <img alt="" src={avatarUrl} /> : user?.name?.[0]?.toUpperCase() || 'A'}
            </Link>
          </div>
        </header>
        <main className="app-content" id="main-content"><Outlet /></main>
      </div>
    </div>
  );
}
