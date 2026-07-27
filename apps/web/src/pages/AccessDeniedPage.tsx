import { LogoutButton } from '../components/LogoutButton';

export function AccessDeniedPage() {
  return (
    <main className="status-page">
      <section className="access-card" aria-labelledby="access-title">
        <span className="brand">Emma</span>
        <p className="eyebrow">Dostęp do portalu</p>
        <h1 id="access-title">
          Brak aktywnego dostępu do portalu szpitala.
        </h1>
        <p>
          Skontaktuj się z administratorem Emma.
        </p>
        <LogoutButton className="secondary-button" />
      </section>
    </main>
  );
}
