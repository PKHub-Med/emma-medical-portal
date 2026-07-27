import type { ReactNode } from 'react';
import { Navigate, Outlet, Route, Routes } from 'react-router-dom';
import type { CurrentUser } from './api';
import { AdminLayout } from './layouts/AdminLayout';
import { PortalLayout } from './layouts/PortalLayout';
import { AccessDeniedPage } from './pages/AccessDeniedPage';
import { AdminDashboardPage } from './pages/AdminDashboardPage';
import { AdminHospitalsPage } from './pages/AdminHospitalsPage';
import { AdminUsersPage } from './pages/AdminUsersPage';
import { AdminAuditPage } from './pages/AdminAuditPage';
import { LoginPage } from './pages/LoginPage';
import { PlaceholderPage } from './pages/PlaceholderPage';
import { PortalDashboardPage } from './pages/PortalDashboardPage';
import { ProfilePage } from './pages/ProfilePage';
import { useCurrentUser } from './query';

export function defaultPathFor(user: CurrentUser): string {
  if (
    user.systemRole === 'EMMA_ADMIN' ||
    user.systemRole === 'SERVICE_OPERATOR'
  ) {
    return '/admin';
  }

  return user.activeHospital ? '/app' : '/brak-dostepu';
}

function SessionCheck(): ReactNode {
  return (
    <main className="status-page" aria-live="polite">
      <p>Sprawdzanie sesji…</p>
    </main>
  );
}

function AuthenticatedRoute() {
  const currentUser = useCurrentUser();

  if (currentUser.isPending) {
    return <SessionCheck />;
  }

  if (!currentUser.data) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}

function PublicOnlyRoute({ children }: { children: ReactNode }) {
  const currentUser = useCurrentUser();

  if (currentUser.isPending) {
    return <SessionCheck />;
  }

  if (currentUser.data) {
    return <Navigate to={defaultPathFor(currentUser.data)} replace />;
  }

  return children;
}

function AreaRoute({ area }: { area: 'portal' | 'admin' }) {
  const currentUser = useCurrentUser();

  if (!currentUser.data) {
    return <Navigate to="/login" replace />;
  }

  const isAdmin =
    currentUser.data.systemRole === 'EMMA_ADMIN' ||
    currentUser.data.systemRole === 'SERVICE_OPERATOR';
  const hasPortalAccess =
    currentUser.data.systemRole === 'USER' &&
    Boolean(currentUser.data.activeHospital);

  if (
    (area === 'admin' && !isAdmin) ||
    (area === 'portal' && !hasPortalAccess)
  ) {
    return (
      <Navigate to={defaultPathFor(currentUser.data)} replace />
    );
  }

  return <Outlet />;
}

function NoAccessRoute() {
  const currentUser = useCurrentUser();

  if (!currentUser.data) {
    return <Navigate to="/login" replace />;
  }

  const hasNoMembership =
    currentUser.data.systemRole === 'USER' &&
    !currentUser.data.activeHospital;

  return hasNoMembership ? (
    <AccessDeniedPage />
  ) : (
    <Navigate to={defaultPathFor(currentUser.data)} replace />
  );
}

function AuthenticatedIndex() {
  const currentUser = useCurrentUser();

  return currentUser.data ? (
    <Navigate to={defaultPathFor(currentUser.data)} replace />
  ) : (
    <Navigate to="/login" replace />
  );
}

export function App() {
  return (
    <Routes>
      <Route
        path="/login"
        element={
          <PublicOnlyRoute>
            <LoginPage />
          </PublicOnlyRoute>
        }
      />

      <Route element={<AuthenticatedRoute />}>
        <Route index element={<AuthenticatedIndex />} />
        <Route path="/brak-dostepu" element={<NoAccessRoute />} />

        <Route element={<AreaRoute area="portal" />}>
          <Route path="/app" element={<PortalLayout />}>
            <Route index element={<PortalDashboardPage />} />
            <Route
              path="devices"
              element={
                <PlaceholderPage
                  title="Urządzenia"
                  description="Urządzenia — moduł zostanie wdrożony w następnym etapie"
                />
              }
            />
            <Route
              path="repairs"
              element={
                <PlaceholderPage
                  title="Naprawy"
                  description="Naprawy — moduł zostanie wdrożony w następnym etapie"
                />
              }
            />
            <Route
              path="inspections"
              element={
                <PlaceholderPage
                  title="Przeglądy"
                  description="Przeglądy — moduł zostanie wdrożony w następnym etapie"
                />
              }
            />
            <Route path="profile" element={<ProfilePage />} />
          </Route>
        </Route>

        <Route element={<AreaRoute area="admin" />}>
          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<AdminDashboardPage />} />
            <Route
              path="hospitals"
              element={<AdminHospitalsPage />}
            />
            <Route
              path="users"
              element={<AdminUsersPage />}
            />
            <Route
              path="statuses"
              element={
                <PlaceholderPage
                  title="Statusy"
                  description="Statusy — moduł zostanie wdrożony w następnym etapie"
                />
              }
            />
            <Route
              path="errors"
              element={
                <PlaceholderPage
                  title="Błędy"
                  description="Błędy — moduł zostanie wdrożony w następnym etapie"
                />
              }
            />
            <Route
              path="emails"
              element={
                <PlaceholderPage
                  title="E-maile"
                  description="E-maile — moduł zostanie wdrożony w następnym etapie"
                />
              }
            />
            <Route
              path="audit"
              element={<AdminAuditPage />}
            />
            <Route path="profile" element={<ProfilePage />} />
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
