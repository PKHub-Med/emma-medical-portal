import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { LogoutButton } from '../components/LogoutButton';
import { UserSummary } from '../components/UserSummary';
import { useCurrentUser } from '../query';

const adminLinks = [
  { to: '/admin', label: 'Podsumowanie', icon: '⌂', end: true },
  { to: '/admin/hospitals', label: 'Szpitale', icon: '□' },
  { to: '/admin/users', label: 'Użytkownicy i dostęp', icon: '♙' },
  { to: '/admin/statuses', label: 'Statusy', icon: '◉' },
  { to: '/admin/errors', label: 'Błędy', icon: '!' },
  { to: '/admin/emails', label: 'E-maile', icon: '✉' },
  { to: '/admin/audit', label: 'Audyt', icon: '≡' },
] as const;

export function AdminLayout() {
  const { data: user } = useCurrentUser();
  const [menuOpen, setMenuOpen] = useState(false);

  if (!user) {
    return null;
  }

  return (
    <div className="shell admin-shell">
      <header className="mobile-header admin-mobile-header">
        <span className="admin-wordmark">EMMA ADMIN</span>
        <button
          className="menu-toggle"
          type="button"
          aria-expanded={menuOpen}
          aria-controls="admin-sidebar"
          onClick={() => setMenuOpen((open) => !open)}
        >
          <span aria-hidden="true">☰</span>
          Menu
        </button>
      </header>

      {menuOpen && (
        <button
          className="drawer-backdrop"
          type="button"
          aria-label="Zamknij menu"
          onClick={() => setMenuOpen(false)}
        />
      )}

      <aside
        className={`sidebar admin-sidebar${menuOpen ? ' is-open' : ''}`}
        id="admin-sidebar"
        aria-label="Nawigacja administratora"
      >
        <div className="sidebar-heading">
          <span className="admin-wordmark">EMMA ADMIN</span>
          <span className="sidebar-context">Panel systemowy</span>
        </div>
        <nav className="primary-nav">
          {adminLinks.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={'end' in link ? link.end : undefined}
              onClick={() => setMenuOpen(false)}
              className={({ isActive }) =>
                `nav-link${isActive ? ' active' : ''}`
              }
            >
              <span className="nav-icon" aria-hidden="true">
                {link.icon}
              </span>
              {link.label}
              <span className="active-label">Bieżąca strona</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          <NavLink
            to="/admin/profile"
            onClick={() => setMenuOpen(false)}
            className={({ isActive }) =>
              `nav-link${isActive ? ' active' : ''}`
            }
          >
            <span className="nav-icon" aria-hidden="true">○</span>
            Profil użytkownika
            <span className="active-label">Bieżąca strona</span>
          </NavLink>
          <LogoutButton onLogout={() => setMenuOpen(false)} />
        </div>
      </aside>

      <main className="shell-main">
        <div className="topbar">
          <div>
            <span className="topbar-label">Obszar</span>
            <strong>Administracja Emma</strong>
          </div>
          <UserSummary user={user} />
        </div>
        <div className="page-content">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
