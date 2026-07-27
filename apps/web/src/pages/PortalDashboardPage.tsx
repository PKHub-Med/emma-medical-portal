import { useCurrentUser } from '../query';

const metrics = [
  'Otwarte naprawy',
  'Przeglądy po terminie',
  'Przeglądy w 30 dni',
  'Urządzenia',
];

export function PortalDashboardPage() {
  const { data: user } = useCurrentUser();
  const hospitalName = user?.memberships[0]?.hospitalName;

  if (!user) {
    return null;
  }

  return (
    <section aria-labelledby="portal-title">
      <div className="page-heading">
        <p className="eyebrow">Podsumowanie</p>
        <h1 id="portal-title">Dzień dobry</h1>
        <p>
          Zalogowano jako <strong>{user.email}</strong>
          {hospitalName ? (
            <>
              {' '}w szpitalu <strong>{hospitalName}</strong>.
            </>
          ) : (
            '.'
          )}
        </p>
      </div>
      <div className="metric-grid">
        {metrics.map((metric) => (
          <article className="metric-card" key={metric}>
            <h2>{metric}</h2>
            <p aria-label={`${metric}: brak danych`}>—</p>
          </article>
        ))}
      </div>
    </section>
  );
}
