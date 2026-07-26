import type { ReactNode } from 'react';
import {
  Navigate,
  Route,
  Routes,
} from 'react-router-dom';
import { useCurrentUser } from './query';
import { AppPage } from './pages/AppPage';
import { LoginPage } from './pages/LoginPage';

function SessionCheck(): ReactNode {
  return (
    <main className="status-page" aria-live="polite">
      <p>Sprawdzanie sesji…</p>
    </main>
  );
}

function ProtectedRoute({ children }: { children: ReactNode }) {
  const currentUser = useCurrentUser();

  if (currentUser.isPending) {
    return <SessionCheck />;
  }

  if (currentUser.isError) {
    return <Navigate to="/login" replace />;
  }

  return children;
}

function PublicOnlyRoute({ children }: { children: ReactNode }) {
  const currentUser = useCurrentUser();

  if (currentUser.isPending) {
    return <SessionCheck />;
  }

  if (currentUser.isSuccess) {
    return <Navigate to="/app" replace />;
  }

  return children;
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
      <Route
        path="/app"
        element={
          <ProtectedRoute>
            <AppPage />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
