import { useQuery } from '@tanstack/react-query';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import type { RepairState } from '../api';
import {
  departmentsQueryOptions,
  repairsQueryOptions,
  useCurrentUser,
} from '../query';

const PAGE_SIZE = 25;
const STATUSES = [
  ['NEW', 'Nowa'],
  ['ACCEPTED', 'Przyjęta'],
  ['WAITING_FOR_SERVICE', 'Oczekuje na serwis'],
  ['IN_PROGRESS', 'W trakcie naprawy'],
  ['COMPLETED', 'Zakończona'],
] as const;

export function RepairsPage() {
  const { data: user } = useCurrentUser();
  const hospitalId = user?.activeHospital?.id ?? '';
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const page = positivePage(params.get('page'));
  const state = validState(params.get('state'));
  const query = {
    page,
    pageSize: PAGE_SIZE,
    search: params.get('search') || undefined,
    departmentId: params.get('departmentId') || undefined,
    status: params.get('status') || undefined,
    state,
    dateFrom: params.get('dateFrom') || undefined,
    dateTo: params.get('dateTo') || undefined,
  };
  const repairs = useQuery(repairsQueryOptions(hospitalId, query));
  const departments = useQuery(departmentsQueryOptions(hospitalId));
  const totalPages = Math.max(
    1,
    Math.ceil((repairs.data?.totalCount ?? 0) / PAGE_SIZE),
  );
  const update = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value && !(key === 'state' && value === 'open')) next.set(key, value);
    else next.delete(key);
    if (key !== 'page') next.delete('page');
    setParams(next);
  };

  return (
    <section className="repairs-page">
      <div className="page-title-row">
        <div>
          <p className="eyebrow">Serwis</p>
          <h1>Naprawy</h1>
          <p>Statusy napraw urządzeń przypisanych do wybranego szpitala.</p>
        </div>
      </div>
      <div className="devices-toolbar repairs-toolbar" aria-label="Filtry napraw">
        <label className="device-search">
          <span>Wyszukaj</span>
          <input
            type="search"
            value={query.search ?? ''}
            placeholder="Numer naprawy lub urządzenia"
            onChange={(event) => update('search', event.target.value)}
          />
        </label>
        <label>
          <span>Oddział</span>
          <select value={query.departmentId ?? ''} onChange={(event) => update('departmentId', event.target.value)}>
            <option value="">Wszystkie oddziały</option>
            {departments.data?.items.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
        <label>
          <span>Status</span>
          <select value={query.status ?? ''} onChange={(event) => update('status', event.target.value)}>
            <option value="">Wszystkie statusy</option>
            {STATUSES.map(([code, label]) => <option key={code} value={code}>{label}</option>)}
          </select>
        </label>
        <label>
          <span>Stan</span>
          <select value={state} onChange={(event) => update('state', event.target.value)}>
            <option value="open">Otwarte</option>
            <option value="closed">Zakończone</option>
            <option value="all">Wszystkie</option>
          </select>
        </label>
        <label><span>Od</span><input aria-label="Data od" type="date" value={query.dateFrom ?? ''} onChange={(event) => update('dateFrom', event.target.value)} /></label>
        <label><span>Do</span><input aria-label="Data do" type="date" value={query.dateTo ?? ''} onChange={(event) => update('dateTo', event.target.value)} /></label>
        <button type="button" className="secondary-button compact-button" disabled={!params.size} onClick={() => setParams({})}>
          Wyczyść filtry
        </button>
      </div>
      {repairs.isPending ? (
        <div className="detail-skeleton" aria-label="Ładowanie napraw" />
      ) : repairs.isError ? (
        <div className="empty-card" role="alert">
          <h2>Nie udało się pobrać napraw</h2>
          <button onClick={() => repairs.refetch()}>Spróbuj ponownie</button>
        </div>
      ) : repairs.data.items.length === 0 ? (
        <div className="empty-card"><h2>Brak napraw</h2><p>Nie znaleziono napraw spełniających wybrane kryteria.</p></div>
      ) : (
        <>
          <div className="table-wrap">
            <table className="devices-table repairs-table">
              <thead><tr><th>Numer naprawy</th><th>Urządzenie</th><th>Oddział</th><th>Status</th><th>Data zgłoszenia</th><th>Ostatnia aktualizacja</th></tr></thead>
              <tbody>{repairs.data.items.map((repair) => (
                <tr
                  key={repair.id}
                  tabIndex={0}
                  onClick={() => navigate(`/app/repairs/${repair.id}`, { state: { listSearch: location.search } })}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      navigate(`/app/repairs/${repair.id}`, { state: { listSearch: location.search } });
                    }
                  }}
                >
                  <td><strong>{repair.businessNumber}</strong></td>
                  <td>{repair.device.name}</td>
                  <td>{repair.department?.name ?? 'Oddział nieprzypisany'}</td>
                  <td><StatusBadge code={repair.customerStatusCode} label={repair.customerLabel} /></td>
                  <td>{formatDate(repair.reportedAt)}</td>
                  <td>{formatDate(repair.updatedAt)}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          <nav className="pagination" aria-label="Paginacja napraw">
            <p>Strona {repairs.data.page} z {totalPages} · {repairs.data.totalCount} napraw</p>
            <div>
              <button className="secondary-button compact-button" disabled={page <= 1} onClick={() => update('page', String(page - 1))}>Poprzednia</button>
              <button className="secondary-button compact-button" disabled={page >= totalPages} onClick={() => update('page', String(page + 1))}>Następna</button>
            </div>
          </nav>
        </>
      )}
    </section>
  );
}

export function StatusBadge({ code, label }: { code: string; label: string }) {
  const tone = code === 'COMPLETED'
    ? 'success'
    : ['WAITING_FOR_SERVICE', 'IN_PROGRESS'].includes(code)
      ? 'warning'
      : 'info';
  return <span className={`repair-status repair-status-${tone}`}>{label}</span>;
}

export function formatDate(value: string | null) {
  return value
    ? new Intl.DateTimeFormat('pl-PL', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
    : 'Brak danych';
}

function positivePage(value: string | null) {
  return value && /^\d+$/.test(value) && Number(value) > 0 ? Number(value) : 1;
}

function validState(value: string | null): RepairState {
  return value === 'closed' || value === 'all' ? value : 'open';
}
