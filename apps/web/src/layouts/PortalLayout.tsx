import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { LogoutButton } from '../components/LogoutButton';
import { UserSummary } from '../components/UserSummary';
import { useCurrentUser } from '../query';

const portalLinks = [
  { to: '/app', label: 'Podsumowanie', mobileLabel: 'Start', icon: '⌂', end: true },
  { to: '/app/devices', label: 'Urządzenia', icon: '▣' },
  { to: '/app/repairs', label: 'Naprawy', icon: '◇' },
  { to: '/app/inspections', label: 'Przeglądy', icon: '✓' },
] as const;

export function PortalLayout() {
  const { data: user } = useCurrentUser();
  const [menuOpen, setMenuOpen] = useState(false);
  const hospitalName = user?.memberships[0]?.hospitalName;

  if (!user) {
    return null;
  }

  return (
    <div className="shell portal-shell">
      <header className="mobile-header">
        <span className="brand brand-compact">Emma</span>
        <button
          className="menu-toggle"
          type="button"
          aria-expanded={menuOpen}
          aria-controls="portal-sidebar"
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
        className={`sidebar${menuOpen ? ' is-open' : ''}`}
        id="portal-sidebar"
        aria-label="Nawigacja portalu"
      >
        <div className="sidebar-heading">
          <span className="brand">Emma</span>
          <span className="sidebar-context">
            {hospitalName ?? 'Portal szpitala'}
          </span>
        </div>
        <nav className="primary-nav">
          {portalLinks.map((link) => (
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
            to="/app/profile"
            onClick={() => setMenuOpen(false)}
            className={({ isActive }) =>
              `nav-link${isActive ? ' active' : ''}`
            }
          >
            <span className="nav-icon" aria-hidden="true">○</span>
            Profil
            <span className="active-label">Bieżąca strona</span>
          </NavLink>
          <LogoutButton onLogout={() => setMenuOpen(false)} />
        </div>
      </aside>

      <main className="shell-main">
        <div className="topbar">
          <div>
            <span className="topbar-label">Aktualny szpital</span>
            <strong>{hospitalName ?? 'Nie wskazano szpitala'}</strong>
          </div>
          <UserSummary user={user} />
        </div>
        <div className="page-content">
          <Outlet />
        </div>
      </main>

      <nav className="bottom-nav" aria-label="Nawigacja mobilna portalu">
        {portalLinks.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            end={'end' in link ? link.end : undefined}
            className={({ isActive }) =>
              `bottom-nav-link${isActive ? ' active' : ''}`
            }
          >
            <span aria-hidden="true">{link.icon}</span>
            {'mobileLabel' in link ? link.mobileLabel : link.label}
            <span className="sr-only active-label">Bieżąca strona</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
