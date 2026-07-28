import { useQuery } from '@tanstack/react-query';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import type { InspectionDue } from '../api';
import {
  departmentsQueryOptions,
  inspectionsQueryOptions,
  useCurrentUser,
} from '../query';

const PAGE_SIZE = 25;
const STATUSES = [
  ['PLANNED', 'Zaplanowany'],
  ['CONFIRMED', 'Termin potwierdzony'],
  ['IN_PROGRESS', 'W trakcie przeglądu'],
  ['COMPLETED', 'Zakończony'],
  ['CANCELLED', 'Anulowany'],
] as const;

export function InspectionsPage() {
  const { data: user } = useCurrentUser();
  const hospitalId = user?.activeHospital?.id ?? '';
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const page = positivePage(params.get('page'));
  const due = validDue(params.get('due'));
  const query = {
    page,
    pageSize: PAGE_SIZE,
    search: params.get('search') || undefined,
    departmentId: params.get('departmentId') || undefined,
    status: params.get('status') || undefined,
    result: params.get('result') || undefined,
    due,
    dateFrom: params.get('dateFrom') || undefined,
    dateTo: params.get('dateTo') || undefined,
  };
  const inspections = useQuery(inspectionsQueryOptions(hospitalId, query));
  const departments = useQuery(departmentsQueryOptions(hospitalId));
  const totalPages = Math.max(
    1,
    Math.ceil((inspections.data?.totalCount ?? 0) / PAGE_SIZE),
  );
  const update = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value && !(key === 'due' && value === 'all')) next.set(key, value);
    else next.delete(key);
    if (key !== 'page') next.delete('page');
    setParams(next);
  };

  return (
    <section className="repairs-page">
      <div className="page-title-row">
        <div>
          <p className="eyebrow">Serwis</p>
          <h1>Przeglądy</h1>
          <p>Terminy i rezultaty przeglądów urządzeń w wybranym szpitalu.</p>
        </div>
      </div>
      <div className="devices-toolbar repairs-toolbar" aria-label="Filtry przeglądów">
        <label className="device-search">
          <span>Wyszukaj</span>
          <input
            type="search"
            value={query.search ?? ''}
            placeholder="Numer przeglądu lub urządzenia"
            onChange={(event) => update('search', event.target.value)}
          />
        </label>
        <label>
          <span>Oddział</span>
          <select aria-label="Oddział" value={query.departmentId ?? ''} onChange={(event) => update('departmentId', event.target.value)}>
            <option value="">Wszystkie oddziały</option>
            {departments.data?.items.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
        <label>
          <span>Status</span>
          <select aria-label="Status" value={query.status ?? ''} onChange={(event) => update('status', event.target.value)}>
            <option value="">Wszystkie statusy</option>
            {STATUSES.map(([code, label]) => <option key={code} value={code}>{label}</option>)}
          </select>
        </label>
        <label>
          <span>Rezultat</span>
          <select aria-label="Rezultat" value={query.result ?? ''} onChange={(event) => update('result', event.target.value)}>
            <option value="">Wszystkie rezultaty</option>
            <option value="Pozytywny">Pozytywny</option>
            <option value="Wymaga działań">Wymaga działań</option>
          </select>
        </label>
        <label>
          <span>Termin</span>
          <select aria-label="Termin" value={due} onChange={(event) => update('due', event.target.value)}>
            <option value="overdue">Po terminie</option>
            <option value="next30days">W ciągu 30 dni</option>
            <option value="future">Późniejsze</option>
            <option value="all">Wszystkie</option>
          </select>
        </label>
        <label><span>Od</span><input aria-label="Data od" type="date" value={query.dateFrom ?? ''} onChange={(event) => update('dateFrom', event.target.value)} /></label>
        <label><span>Do</span><input aria-label="Data do" type="date" value={query.dateTo ?? ''} onChange={(event) => update('dateTo', event.target.value)} /></label>
        <button type="button" className="secondary-button compact-button" disabled={!params.size} onClick={() => setParams({})}>
          Wyczyść filtry
        </button>
      </div>
      {inspections.isPending ? (
        <div className="detail-skeleton" aria-label="Ładowanie przeglądów" />
      ) : inspections.isError ? (
        <div className="empty-card" role="alert">
          <h2>Nie udało się pobrać przeglądów</h2>
          <button onClick={() => inspections.refetch()}>Spróbuj ponownie</button>
        </div>
      ) : inspections.data.items.length === 0 ? (
        <div className="empty-card"><h2>Brak przeglądów</h2><p>Nie znaleziono przeglądów spełniających wybrane kryteria.</p></div>
      ) : (
        <>
          <div className="table-wrap">
            <table className="devices-table repairs-table">
              <thead><tr><th>Numer przeglądu</th><th>Urządzenie</th><th>Oddział</th><th>Status / rezultat</th><th>Planowany termin</th><th>Przegląd do</th></tr></thead>
              <tbody>{inspections.data.items.map((inspection) => (
                <tr
                  key={inspection.id}
                  tabIndex={0}
                  onClick={() => navigate(`/app/inspections/${inspection.id}`, { state: { listSearch: location.search } })}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      navigate(`/app/inspections/${inspection.id}`, { state: { listSearch: location.search } });
                    }
                  }}
                >
                  <td><strong>{inspection.businessNumber}</strong></td>
                  <td>{inspection.device.name}</td>
                  <td>{inspection.department?.name ?? 'Oddział nieprzypisany'}</td>
                  <td>
                    <div className="inspection-badges">
                      <InspectionStatusBadge code={inspection.customerStatusCode} label={inspection.customerLabel} />
                      {inspection.isOverdue && <OverdueBadge />}
                    </div>
                    {inspection.result && <small>{inspection.result}</small>}
                  </td>
                  <td>{formatInspectionDate(inspection.plannedAt)}</td>
                  <td>{formatInspectionDate(inspection.dueAt)}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          <nav className="pagination" aria-label="Paginacja przeglądów">
            <p>Strona {inspections.data.page} z {totalPages} · {inspections.data.totalCount} przeglądów</p>
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

export function InspectionStatusBadge({ code, label }: { code: string; label: string }) {
  const tone = code === 'COMPLETED'
    ? 'success'
    : code === 'IN_PROGRESS'
      ? 'warning'
      : code === 'CANCELLED'
        ? 'neutral'
        : 'info';
  return <span className={`repair-status repair-status-${tone}`}>{label}</span>;
}

export function OverdueBadge() {
  return <span className="repair-status repair-status-danger">Po terminie</span>;
}

export function formatInspectionDate(value: string | null) {
  return value
    ? new Intl.DateTimeFormat('pl-PL', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
    : 'Brak danych';
}

function positivePage(value: string | null) {
  return value && /^\d+$/.test(value) && Number(value) > 0 ? Number(value) : 1;
}

function validDue(value: string | null): InspectionDue {
  return value === 'overdue' || value === 'next30days' || value === 'future'
    ? value
    : 'all';
}
