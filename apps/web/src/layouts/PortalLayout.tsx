import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { setActiveHospital } from '../api';
import { LogoutButton } from '../components/LogoutButton';
import { UserSummary } from '../components/UserSummary';
import {
  currentUserQueryKey,
  portalHospitalsQueryKey,
  portalHospitalsQueryOptions,
  useCurrentUser,
} from '../query';

const portalLinks = [
  { to: '/app', label: 'Podsumowanie', mobileLabel: 'Start', icon: '⌂', end: true },
  { to: '/app/devices', label: 'Urządzenia', icon: '▣' },
  { to: '/app/repairs', label: 'Naprawy', icon: '◇' },
  { to: '/app/inspections', label: 'Przeglądy', icon: '✓' },
] as const;

export function PortalLayout() {
  const { data: user } = useCurrentUser();
  const hospitalsQuery = useQuery(portalHospitalsQueryOptions());
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const switchMutation = useMutation({
    mutationFn: setActiveHospital,
    onSuccess: async (activeHospital) => {
      queryClient.setQueryData(currentUserQueryKey, (current) => {
        if (!current || typeof current !== 'object') {
          return current;
        }
        return { ...current, activeHospital };
      });
      queryClient.removeQueries({
        predicate: (query) =>
          query.queryKey[0] !== currentUserQueryKey[0] &&
          query.queryKey[0] !== portalHospitalsQueryKey[0],
      });
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: currentUserQueryKey,
        }),
        queryClient.invalidateQueries({
          queryKey: portalHospitalsQueryKey,
        }),
      ]);
      navigate('/app', { replace: true });
    },
  });

  if (!user) {
    return null;
  }

  const hospitalName =
    user.activeHospital?.name ?? 'Nie wskazano szpitala';
  const availableHospitals = hospitalsQuery.data?.items ?? [];
  const selectedHospitalId =
    user.activeHospital?.id ??
    hospitalsQuery.data?.activeHospitalId ??
    '';

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
          <span className="sidebar-context">{hospitalName}</span>
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
        <div className="topbar portal-topbar">
          <div>
            {availableHospitals.length >= 2 ? (
              <label className="hospital-switcher">
                <span>Szpital</span>
                <select
                  value={selectedHospitalId}
                  disabled={switchMutation.isPending}
                  onChange={(event) =>
                    switchMutation.mutate(event.target.value)
                  }
                >
                  {availableHospitals.map((hospital) => (
                    <option value={hospital.id} key={hospital.id}>
                      {hospital.name}
                    </option>
                  ))}
                </select>
                {switchMutation.isPending && (
                  <small role="status">Zmienianie szpitala…</small>
                )}
              </label>
            ) : (
              <>
                <span className="topbar-label">Aktualny szpital</span>
                <strong>{hospitalName}</strong>
              </>
            )}
            {switchMutation.isError && (
              <span className="switch-error" role="alert">
                Nie udało się zmienić szpitala.
              </span>
            )}
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
