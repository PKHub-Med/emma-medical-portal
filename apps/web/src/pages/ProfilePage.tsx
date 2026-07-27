import { useCurrentUser } from '../query';

export function ProfilePage() {
  const { data: user } = useCurrentUser();

  if (!user) {
    return null;
  }

  return (
    <section className="placeholder-page" aria-labelledby="profile-title">
      <p className="eyebrow">Konto</p>
      <h1 id="profile-title">Profil użytkownika</h1>
      <div className="profile-card">
        <span>Adres e-mail</span>
        <strong>{user.email}</strong>
        <p>Profil — moduł zostanie wdrożony w następnym etapie</p>
      </div>
    </section>
  );
}
