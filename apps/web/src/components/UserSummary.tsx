import type { CurrentUser } from '../api';

export function getUserInitials(email: string): string {
  const name = email.split('@')[0] ?? '';
  const parts = name.split(/[._+\-\s]+/).filter(Boolean);

  return (
    parts
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join('') || 'U'
  );
}

export function UserSummary({
  user,
  compact = false,
}: {
  user: CurrentUser;
  compact?: boolean;
}) {
  return (
    <div className={`user-summary${compact ? ' compact' : ''}`}>
      <span className="avatar" aria-hidden="true">
        {getUserInitials(user.email)}
      </span>
      <span className="user-summary-text">
        <strong>{user.email}</strong>
        {!compact && <span>Zalogowany użytkownik</span>}
      </span>
    </div>
  );
}
