const metrics = [
  'Szpitale',
  'Aktywni użytkownicy',
  'Błędy wymagające uwagi',
];

export function AdminDashboardPage() {
  return (
    <section aria-labelledby="admin-title">
      <div className="page-heading">
        <p className="eyebrow">EMMA ADMIN</p>
        <h1 id="admin-title">Panel administracyjny Emma</h1>
        <p>Centralne miejsce zarządzania portalem Emma.</p>
      </div>
      <div className="metric-grid admin-metric-grid">
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
