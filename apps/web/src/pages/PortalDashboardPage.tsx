import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import type {
  DashboardStatusChange,
  DashboardUpcomingInspection,
} from '../api';
import { dashboardQueryOptions, useCurrentUser } from '../query';

export function PortalDashboardPage() {
  const { data: user } = useCurrentUser();
  const activeHospitalId = user?.activeHospital?.id ?? '';
  const dashboard = useQuery(dashboardQueryOptions(activeHospitalId));

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
          {user.activeHospital?.name ? (
            <>
              {' '}w szpitalu <strong>{user.activeHospital.name}</strong>.
            </>
          ) : (
            '.'
          )}
        </p>
      </div>

      {dashboard.isPending ? (
        <DashboardSkeleton />
      ) : dashboard.isError ? (
        <div className="dashboard-error" role="alert">
          <strong>Nie udało się pobrać podsumowania.</strong>
          <span>Sprawdź połączenie i spróbuj ponownie.</span>
          <button
            className="secondary-button compact-button"
            type="button"
            onClick={() => dashboard.refetch()}
          >
            Spróbuj ponownie
          </button>
        </div>
      ) : (
        <>
          <div className="metric-grid">
            <MetricCard
              title="Otwarte naprawy"
              value={dashboard.data.openRepairs}
              description="Przejdź do listy napraw"
              to="/app/repairs?state=open"
            />
            <MetricCard
              title="Przeglądy po terminie"
              value={dashboard.data.overdueInspections}
              description="Wymagają uwagi"
              to="/app/inspections?due=overdue"
            />
            <MetricCard
              title="Przeglądy w 30 dni"
              value={dashboard.data.inspectionsNext30Days}
              description={
                dashboard.data.upcomingInspections[0]
                  ? `Najbliższy: ${formatDashboardDate(
                      dashboard.data.upcomingInspections[0].dueAt,
                    )}`
                  : 'Brak zaplanowanych terminów'
              }
              to="/app/inspections?due=next30days"
            />
            <MetricCard
              title="Urządzenia"
              value={dashboard.data.devices}
              description="W całym szpitalu"
              to="/app/devices"
            />
          </div>

          <div className="dashboard-sections">
            <StatusChanges items={dashboard.data.recentStatusChanges} />
            <UpcomingInspections
              items={dashboard.data.upcomingInspections}
            />
          </div>
        </>
      )}
    </section>
  );
}

function MetricCard({
  title,
  value,
  description,
  to,
}: {
  title: string;
  value: number;
  description: string;
  to: string;
}) {
  return (
    <Link className="metric-card metric-link" to={to}>
      <h2>{title}</h2>
      <p>{value}</p>
      <span>{description}</span>
    </Link>
  );
}

function StatusChanges({ items }: { items: DashboardStatusChange[] }) {
  return (
    <section className="dashboard-panel" aria-labelledby="status-changes-title">
      <h2 id="status-changes-title">Ostatnie zmiany statusów</h2>
      {items.length === 0 ? (
        <p className="dashboard-empty">Brak ostatnich zmian statusów.</p>
      ) : (
        <ul className="dashboard-list">
          {items.map((item) => (
            <li key={item.id}>
              <Link
                to={`/app/${
                  item.entityType === 'REPAIR' ? 'repairs' : 'inspections'
                }/${item.entityId}`}
              >
                <div>
                  <span className="dashboard-item-type">
                    {item.entityType === 'REPAIR' ? 'Naprawa' : 'Przegląd'}
                  </span>
                  <strong>{item.businessNumber}</strong>
                  <span>{item.deviceName}</span>
                </div>
                <div className="dashboard-item-meta">
                  <span className="repair-status repair-status-info">
                    {item.label}
                  </span>
                  <time dateTime={item.changedAt}>
                    {formatDashboardDateTime(item.changedAt)}
                  </time>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function UpcomingInspections({
  items,
}: {
  items: DashboardUpcomingInspection[];
}) {
  return (
    <section className="dashboard-panel" aria-labelledby="upcoming-title">
      <h2 id="upcoming-title">Najbliższe przeglądy</h2>
      {items.length === 0 ? (
        <p className="dashboard-empty">Brak nadchodzących przeglądów.</p>
      ) : (
        <ul className="dashboard-list">
          {items.map((item) => (
            <li key={item.id}>
              <Link to={`/app/inspections/${item.id}`}>
                <div>
                  <span className="dashboard-days">
                    {item.daysUntilDue} dni do terminu
                  </span>
                  <strong>{item.deviceName}</strong>
                  <span>
                    {item.departmentName ?? 'Oddział nieprzypisany'}
                  </span>
                </div>
                <div className="dashboard-item-meta">
                  <span>{item.businessNumber}</span>
                  <span>
                    Przegląd do {formatDashboardDate(item.dueAt)}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function DashboardSkeleton() {
  return (
    <div aria-label="Ładowanie podsumowania" role="status">
      <div className="metric-grid dashboard-skeleton-grid">
        {Array.from({ length: 4 }, (_, index) => (
          <div className="metric-card dashboard-skeleton" key={index}>
            <span />
            <span />
            <span />
          </div>
        ))}
      </div>
      <div className="dashboard-sections">
        {Array.from({ length: 2 }, (_, panel) => (
          <div className="dashboard-panel dashboard-panel-skeleton" key={panel}>
            <span />
            <span />
            <span />
            <span />
          </div>
        ))}
      </div>
    </div>
  );
}

function formatDashboardDate(value: string) {
  return new Intl.DateTimeFormat('pl-PL', {
    dateStyle: 'medium',
  }).format(new Date(value));
}

function formatDashboardDateTime(value: string) {
  return new Intl.DateTimeFormat('pl-PL', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}
