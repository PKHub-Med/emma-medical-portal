import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { logout } from '../api';

export function LogoutButton({
  className = 'nav-action',
  onLogout,
}: {
  className?: string;
  onLogout?: () => void;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const logoutMutation = useMutation({
    mutationFn: logout,
    onSettled: () => {
      queryClient.clear();
      onLogout?.();
      navigate('/login', { replace: true });
    },
  });

  return (
    <button
      className={className}
      type="button"
      onClick={() => logoutMutation.mutate()}
      disabled={logoutMutation.isPending}
    >
      <span aria-hidden="true">↪</span>
      {logoutMutation.isPending ? 'Wylogowywanie…' : 'Wyloguj się'}
    </button>
  );
}
