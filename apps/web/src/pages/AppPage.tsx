import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { logout } from '../api';
import {
  currentUserQueryKey,
  useCurrentUser,
} from '../query';

export function AppPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const currentUser = useCurrentUser();
  const logoutMutation = useMutation({
    mutationFn: logout,
    onSettled: () => {
      queryClient.removeQueries({ queryKey: currentUserQueryKey });
      navigate('/login', { replace: true });
    },
  });

  if (!currentUser.data) {
    return null;
  }

  return (
    <main className="app-page">
      <section className="app-card" aria-labelledby="app-title">
        <p className="eyebrow">Portal aparatury medycznej</p>
        <h1 id="app-title">Emma</h1>
        <div className="account-details">
          <p>
            Zalogowano jako:{' '}
            <strong>{currentUser.data.email}</strong>
          </p>
          <p>
            Rola systemowa:{' '}
            <strong>{currentUser.data.systemRole}</strong>
          </p>
        </div>
        <button
          className="secondary-button"
          type="button"
          onClick={() => logoutMutation.mutate()}
          disabled={logoutMutation.isPending}
        >
          {logoutMutation.isPending
            ? 'Wylogowywanie…'
            : 'Wyloguj się'}
        </button>
      </section>
    </main>
  );
}
