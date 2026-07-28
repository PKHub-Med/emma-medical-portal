import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { AuditEvent, AuditOutcome } from '../api';
import { getAdminHospitals } from '../api';
import { adminAuditQueryOptions } from '../query';

const PAGE_SIZE = 25;

export const auditActionLabels: Record<string, string> = {
  AUTH_LOGIN_SUCCEEDED: 'Poprawne logowanie',
  AUTH_LOGIN_FAILED: 'Nieudane logowanie',
  AUTH_LOGOUT: 'Wylogowanie',
  HOSPITAL_CREATED: 'Utworzono szpital',
  HOSPITAL_UPDATED: 'Zmieniono szpital',
  USER_CREATED: 'Utworzono użytkownika',
  USER_STATUS_CHANGED: 'Zmieniono status użytkownika',
  USER_DELETED: 'Usunięto konto użytkownika',
  USER_RESTORED: 'Przywrócono konto użytkownika',
  MEMBERSHIP_CREATED: 'Nadano dostęp',
  MEMBERSHIP_UPDATED: 'Zmieniono dostęp',
  MEMBERSHIP_DELETED: 'Odebrano dostęp',
  ACTIVE_HOSPITAL_CHANGED: 'Zmieniono aktywny szpital',
  STATUS_MAPPING_CREATED: 'Utworzono mapowanie statusu',
  STATUS_MAPPING_UPDATED: 'Zmieniono mapowanie statusu',
};

export function AdminAuditPage() {
  const [url, setUrl] = useSearchParams();
  const [searchInput, setSearchInput] = useState(url.get('search') ?? '');
  const [selected, setSelected] = useState<AuditEvent | null>(null);
  const page = Math.max(1, Number(url.get('page')) || 1);
  const audit = useQuery(
    adminAuditQueryOptions({
      page,
      pageSize: PAGE_SIZE,
      ...(url.get('search') ? { search: url.get('search')! } : {}),
      ...(url.get('action') ? { action: url.get('action')! } : {}),
      ...(url.get('outcome')
        ? { outcome: url.get('outcome') as AuditOutcome }
        : {}),
      ...(url.get('hospitalId')
        ? { hospitalId: url.get('hospitalId')! }
        : {}),
      ...(url.get('dateFrom')
        ? { dateFrom: `${url.get('dateFrom')}T00:00:00.000Z` }
        : {}),
      ...(url.get('dateTo')
        ? { dateTo: `${url.get('dateTo')}T23:59:59.999Z` }
        : {}),
    }),
  );
  const hospitals = useQuery({
    queryKey: ['audit-hospital-options'],
    queryFn: () => getAdminHospitals({ page: 1, pageSize: 100 }),
    staleTime: 60_000,
  });
  const totalPages = Math.max(
    1,
    Math.ceil((audit.data?.totalCount ?? 0) / PAGE_SIZE),
  );

  const setFilter = (
    name: string,
    value: string,
    resetPage = true,
  ) => {
    setUrl((current) => {
      const next = new URLSearchParams(current);
      if (value) next.set(name, value);
      else next.delete(name);
      if (resetPage) next.delete('page');
      return next;
    });
  };
  const clearFilters = () => {
    setSearchInput('');
    setUrl({});
  };

  return (
    <section aria-labelledby="audit-title">
      <div className="page-title-row">
        <div>
          <p className="eyebrow">Administracja</p>
          <h1 id="audit-title">Dziennik audytowy</h1>
          <p>Niezmienna historia operacji wykonanych w systemie Emma.</p>
        </div>
      </div>

      <div className="hospital-toolbar audit-toolbar">
        <form
          className="hospital-search"
          onSubmit={(event) => {
            event.preventDefault();
            setFilter('search', searchInput.trim());
          }}
        >
          <label htmlFor="audit-search">Wyszukaj</label>
          <div>
            <input
              id="audit-search"
              type="search"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="E-mail, operacja, ID obiektu lub requestId"
            />
            <button className="secondary-button compact-button" type="submit">
              Szukaj
            </button>
          </div>
        </form>
        <AuditSelect
          id="audit-action"
          label="Typ operacji"
          value={url.get('action') ?? ''}
          onChange={(value) => setFilter('action', value)}
          options={Object.entries(auditActionLabels)}
        />
        <AuditSelect
          id="audit-outcome"
          label="Rezultat"
          value={url.get('outcome') ?? ''}
          onChange={(value) => setFilter('outcome', value)}
          options={[
            ['SUCCESS', 'Sukces'],
            ['FAILURE', 'Niepowodzenie'],
          ]}
        />
        <AuditSelect
          id="audit-hospital"
          label="Szpital"
          value={url.get('hospitalId') ?? ''}
          onChange={(value) => setFilter('hospitalId', value)}
          options={(hospitals.data?.items ?? []).map((hospital) => [
            hospital.id,
            hospital.name,
          ])}
        />
        <label className="audit-date">
          Od
          <input
            aria-label="Data od"
            type="date"
            value={url.get('dateFrom') ?? ''}
            onChange={(event) => setFilter('dateFrom', event.target.value)}
          />
        </label>
        <label className="audit-date">
          Do
          <input
            aria-label="Data do"
            type="date"
            value={url.get('dateTo') ?? ''}
            onChange={(event) => setFilter('dateTo', event.target.value)}
          />
        </label>
        <button
          className="secondary-button compact-button"
          type="button"
          onClick={clearFilters}
        >
          Wyczyść filtry
        </button>
      </div>

      <div className="hospital-table-card">
        {audit.isPending ? (
          <AuditSkeleton />
        ) : audit.isError ? (
          <div className="table-message" role="alert">
            <strong>Nie udało się pobrać dziennika audytowego.</strong>
            <span>Sprawdź połączenie i spróbuj ponownie.</span>
            <button
              className="secondary-button compact-button"
              type="button"
              onClick={() => void audit.refetch()}
            >
              Spróbuj ponownie
            </button>
          </div>
        ) : audit.data.items.length === 0 ? (
          <div className="table-message">
            <strong>Brak zdarzeń dla wybranych filtrów</strong>
            <button
              className="secondary-button compact-button"
              type="button"
              onClick={clearFilters}
            >
              Wyczyść filtry
            </button>
          </div>
        ) : (
          <>
            <div className="table-scroll">
              <table className="hospital-table audit-table">
                <thead>
                  <tr>
                    <th scope="col">Data i godzina</th>
                    <th scope="col">Użytkownik</th>
                    <th scope="col">Operacja</th>
                    <th scope="col">Rezultat</th>
                    <th scope="col">Obiekt</th>
                    <th scope="col">Szpital</th>
                    <th scope="col">Szczegóły</th>
                  </tr>
                </thead>
                <tbody>
                  {audit.data.items.map((event) => (
                    <tr key={event.id}>
                      <td>{formatDate(event.createdAt)}</td>
                      <td>{event.actor?.email ?? 'System / anonimowy'}</td>
                      <td>{auditActionLabels[event.action] ?? event.action}</td>
                      <td>
                        <span
                          className={`status-badge ${
                            event.outcome === 'SUCCESS'
                              ? 'positive'
                              : 'negative'
                          }`}
                        >
                          {event.outcome === 'SUCCESS'
                            ? 'Sukces'
                            : 'Niepowodzenie'}
                        </span>
                      </td>
                      <td>{formatEntity(event)}</td>
                      <td>{event.hospital?.name ?? '—'}</td>
                      <td>
                        <button
                          className="secondary-button compact-button"
                          type="button"
                          onClick={() => setSelected(event)}
                        >
                          Szczegóły
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="pagination">
              <span>
                Strona {page} z {totalPages} · {audit.data.totalCount} zdarzeń
              </span>
              <div>
                <button
                  className="secondary-button compact-button"
                  type="button"
                  disabled={page <= 1}
                  onClick={() =>
                    setFilter('page', String(page - 1), false)
                  }
                >
                  Poprzednia
                </button>
                <button
                  className="secondary-button compact-button"
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() =>
                    setFilter('page', String(page + 1), false)
                  }
                >
                  Następna
                </button>
              </div>
            </div>
          </>
        )}
      </div>
      {selected && (
        <AuditDetails event={selected} onClose={() => setSelected(null)} />
      )}
    </section>
  );
}

function AuditSelect({
  id,
  label,
  value,
  onChange,
  options,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[][];
}) {
  return (
    <div className="hospital-filter">
      <label htmlFor={id}>{label}</label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">Wszystkie</option>
        {options.map(([optionValue, text]) => (
          <option key={optionValue} value={optionValue}>
            {text}
          </option>
        ))}
      </select>
    </div>
  );
}

function AuditDetails({
  event,
  onClose,
}: {
  event: AuditEvent;
  onClose: () => void;
}) {
  return (
    <div className="modal-layer" role="presentation">
      <button
        className="modal-backdrop"
        type="button"
        aria-label="Zamknij szczegóły"
        onClick={onClose}
      />
      <div
        className="hospital-dialog audit-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="audit-details-title"
      >
        <h2 id="audit-details-title">Szczegóły zdarzenia</h2>
        <dl className="audit-details">
          <Detail label="Data" value={formatDate(event.createdAt)} />
          <Detail
            label="Aktor"
            value={event.actor?.email ?? 'System / anonimowy'}
          />
          <Detail
            label="Akcja"
            value={auditActionLabels[event.action] ?? event.action}
          />
          <Detail label="Obiekt" value={formatEntity(event)} />
          <Detail label="Szpital" value={event.hospital?.name ?? '—'} />
          <Detail label="requestId" value={event.requestId ?? '—'} />
          <Detail label="Adres IP" value={event.ipAddress ?? '—'} />
          <Detail label="User-Agent" value={event.userAgent ?? '—'} />
        </dl>
        <h3>Metadane</h3>
        <Metadata value={event.metadata} />
        <div className="dialog-actions">
          <button
            className="primary-button compact-button"
            type="button"
            onClick={onClose}
          >
            Zamknij
          </button>
        </div>
      </div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </>
  );
}

function Metadata({ value }: { value: unknown }) {
  if (!value || typeof value !== 'object') {
    return <p>Brak metadanych</p>;
  }
  return (
    <dl className="metadata-list">
      {Object.entries(value as Record<string, unknown>).map(([key, item]) => (
        <div key={key}>
          <dt>{humanize(key)}</dt>
          <dd>{formatMetadataValue(item)}</dd>
        </div>
      ))}
    </dl>
  );
}

function formatMetadataValue(value: unknown): string {
  if (Array.isArray(value)) return value.map(String).join(', ');
  if (value && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>)
      .map(([key, nested]) => `${humanize(key)}: ${String(nested)}`)
      .join(' · ');
  }
  return String(value ?? '—');
}

function AuditSkeleton() {
  return (
    <div className="table-skeleton" aria-label="Ładowanie dziennika">
      {Array.from({ length: 7 }, (_, index) => (
        <div className="skeleton-row audit-skeleton-row" key={index}>
          {Array.from({ length: 7 }, (__, cell) => (
            <span key={cell} />
          ))}
        </div>
      ))}
    </div>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('pl-PL', {
    dateStyle: 'short',
    timeStyle: 'medium',
  }).format(new Date(value));
}

function formatEntity(event: AuditEvent) {
  if (!event.entityType && !event.entityId) return '—';
  return `${event.entityType ?? 'OBIEKT'}${
    event.entityId ? ` · ${event.entityId}` : ''
  }`;
}

function humanize(value: string) {
  return value
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/^./, (letter) => letter.toUpperCase());
}
