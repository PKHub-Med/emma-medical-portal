import { LogoutButton } from '../components/LogoutButton';

export function AccessDeniedPage() {
  return (
    <main className="status-page">
      <section className="access-card" aria-labelledby="access-title">
        <span className="brand">Emma</span>
        <p className="eyebrow">Dostęp do portalu</p>
        <h1 id="access-title">
          Brak przypisanego dostępu do szpitala.
        </h1>
        <p>
          Skontaktuj się z administratorem Emma, aby uzyskać dostęp.
        </p>
        <LogoutButton className="secondary-button" />
      </section>
    </main>
  );
}
