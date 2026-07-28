import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  getAdminEmail,
  getAdminHospitals,
  reprocessAdminEmail,
  type EmailDeliveryStatus,
  type NotificationEntityType,
  type NotificationEvent,
  type NotificationEventDetails,
  type NotificationEventStatus,
} from '../api';
import { adminEmailsQueryKey, adminEmailsQueryOptions } from '../query';

const PAGE_SIZE = 25;
export const eventStatusLabels: Record<NotificationEventStatus, string> = {
  PENDING: 'Oczekuje', READY: 'Gotowe do wysyłki', BLOCKED: 'Zablokowane',
  COMPLETED: 'Zakończone', FAILED: 'Błąd',
};
export const deliveryStatusLabels: Record<EmailDeliveryStatus, string> = {
  QUEUED: 'W kolejce', SKIPPED: 'Pominięto', SENT: 'Wysłano',
  DELIVERED: 'Dostarczono', BOUNCED: 'Odbicie', COMPLAINED: 'Zgłoszono spam',
  FAILED: 'Błąd wysyłki',
};
const blockedLabels: Record<string, string> = {
  COMMUNICATION_DISABLED: 'Komunikacja wyłączona',
  NO_ACTIVE_RECIPIENT: 'Brak aktywnego odbiorcy',
  EMAIL_DISABLED_FOR_STATUS: 'Wysyłka wyłączona dla statusu',
  EMAIL_TEMPLATE_MISSING: 'Brak szablonu',
};

export function AdminEmailsPage() {
  const [url, setUrl] = useSearchParams();
  const [search, setSearch] = useState(url.get('search') ?? '');
  const [detailsId, setDetailsId] = useState<string | null>(null);
  const page = Math.max(1, Number(url.get('page')) || 1);
  const events = useQuery(adminEmailsQueryOptions({
    page, pageSize: PAGE_SIZE,
    ...(url.get('search') ? { search: url.get('search')! } : {}),
    ...(url.get('hospitalId') ? { hospitalId: url.get('hospitalId')! } : {}),
    ...(url.get('entityType') ? { entityType: url.get('entityType') as NotificationEntityType } : {}),
    ...(url.get('eventStatus') ? { eventStatus: url.get('eventStatus') as NotificationEventStatus } : {}),
    ...(url.get('deliveryStatus') ? { deliveryStatus: url.get('deliveryStatus') as EmailDeliveryStatus } : {}),
    ...(url.get('dateFrom') ? { dateFrom: `${url.get('dateFrom')}T00:00:00.000Z` } : {}),
    ...(url.get('dateTo') ? { dateTo: `${url.get('dateTo')}T23:59:59.999Z` } : {}),
  }));
  const hospitals = useQuery({
    queryKey: ['email-hospital-options'],
    queryFn: () => getAdminHospitals({ page: 1, pageSize: 100 }),
  });
  const details = useQuery({
    queryKey: [...adminEmailsQueryKey, 'details', detailsId],
    queryFn: () => getAdminEmail(detailsId!),
    enabled: Boolean(detailsId),
  });
  const queryClient = useQueryClient();
  const reprocess = useMutation({
    mutationFn: reprocessAdminEmail,
    onSuccess: async (value) => {
      await queryClient.invalidateQueries({ queryKey: adminEmailsQueryKey });
      queryClient.setQueryData([...adminEmailsQueryKey, 'details', value.id], value);
    },
  });
  const totalPages = Math.max(1, Math.ceil((events.data?.totalCount ?? 0) / PAGE_SIZE));
  const setFilter = (name: string, value: string, resetPage = true) => setUrl((current) => {
    const next = new URLSearchParams(current);
    value ? next.set(name, value) : next.delete(name);
    if (resetPage) next.delete('page');
    return next;
  });
  const clear = () => { setSearch(''); setUrl({}); };

  return <section aria-labelledby="emails-title">
    <div className="page-title-row"><div><p className="eyebrow">Administracja</p>
      <h1 id="emails-title">Historia e-maili</h1>
      <p>Zdarzenia komunikacyjne i wiadomości przygotowane do wysyłki.</p></div></div>
    <div className="email-notice" role="note">Wysyłka przez zewnętrznego dostawcę nie jest jeszcze aktywna. Wiadomości o statusie „W kolejce” nie zostały wysłane.</div>
    <div className="hospital-toolbar email-toolbar">
      <form className="hospital-search" onSubmit={(event) => { event.preventDefault(); setFilter('search', search.trim()); }}>
        <label htmlFor="email-search">Wyszukaj</label><div><input id="email-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Numer sprawy, odbiorca lub status" /><button className="secondary-button compact-button" type="submit">Szukaj</button></div>
      </form>
      <Filter label="Szpital" value={url.get('hospitalId') ?? ''} onChange={(v) => setFilter('hospitalId', v)} options={(hospitals.data?.items ?? []).map((h) => [h.id, h.name])} />
      <Filter label="Typ sprawy" value={url.get('entityType') ?? ''} onChange={(v) => setFilter('entityType', v)} options={[['REPAIR', 'Naprawa'], ['INSPECTION', 'Przegląd']]} />
      <Filter label="Status zdarzenia" value={url.get('eventStatus') ?? ''} onChange={(v) => setFilter('eventStatus', v)} options={Object.entries(eventStatusLabels)} />
      <Filter label="Status wiadomości" value={url.get('deliveryStatus') ?? ''} onChange={(v) => setFilter('deliveryStatus', v)} options={Object.entries(deliveryStatusLabels)} />
      <label className="audit-date">Od<input aria-label="Data od" type="date" value={url.get('dateFrom') ?? ''} onChange={(e) => setFilter('dateFrom', e.target.value)} /></label>
      <label className="audit-date">Do<input aria-label="Data do" type="date" value={url.get('dateTo') ?? ''} onChange={(e) => setFilter('dateTo', e.target.value)} /></label>
      <button className="secondary-button compact-button" type="button" onClick={clear}>Wyczyść filtry</button>
    </div>
    <div className="hospital-table-card">
      {events.isPending ? <div className="table-message">Ładowanie historii…</div>
        : events.isError ? <div className="table-message" role="alert">Nie udało się pobrać historii e-maili.</div>
        : !events.data.items.length ? <div className="table-message">Brak zdarzeń dla wybranych filtrów.</div>
        : <><div className="table-scroll"><table className="hospital-table email-table">
          <thead><tr><th>Data</th><th>Szpital</th><th>Sprawa</th><th>Status klienta</th><th>Status zdarzenia</th><th>Odbiorcy</th><th>Status wiadomości</th><th>Akcje</th></tr></thead>
          <tbody>{events.data.items.map((event) => <EventRow key={event.id} event={event} onDetails={setDetailsId} />)}</tbody>
        </table></div><div className="pagination"><span>Strona {page} z {totalPages} · {events.data.totalCount} zdarzeń</span><div>
          <button className="secondary-button compact-button" type="button" disabled={page <= 1} onClick={() => setFilter('page', String(page - 1), false)}>Poprzednia</button>
          <button className="secondary-button compact-button" type="button" disabled={page >= totalPages} onClick={() => setFilter('page', String(page + 1), false)}>Następna</button>
        </div></div></>}
    </div>
    {detailsId && <DetailsModal value={details.data} loading={details.isPending} onClose={() => setDetailsId(null)} onReprocess={(id) => {
      if (window.confirm('System ponownie sprawdzi ustawienia komunikacji i odbiorców. Nie zostanie utworzone drugie zdarzenie.')) reprocess.mutate(id);
    }} reprocessing={reprocess.isPending} />}
  </section>;
}

function EventRow({ event, onDetails }: { event: NotificationEvent; onDetails: (id: string) => void }) {
  const statuses = [...new Set(event.deliveries.map((item) => item.status))];
  return <tr><td>{formatDate(event.occurredAt)}</td><td>{event.hospital.name}</td>
    <td><strong>{event.businessNumber}</strong><small>{event.entityType === 'REPAIR' ? 'Naprawa' : 'Przegląd'}</small></td>
    <td>{event.customerLabel}</td><td><StatusBadge value={event.status} label={eventStatusLabels[event.status]} />{event.status === 'BLOCKED' && <small className="blocked-reason">{blockedLabels[event.blockedReasonCode ?? ''] ?? event.blockedReasonMessage}</small>}</td>
    <td>{event.deliveries.length ? event.deliveries.map((item) => item.recipientEmail).join(', ') : '—'}</td>
    <td>{statuses.length ? statuses.map((status) => <StatusBadge key={status} value={status} label={deliveryStatusLabels[status]} />) : '—'}</td>
    <td><button className="secondary-button compact-button" type="button" onClick={() => onDetails(event.id)}>Szczegóły</button></td></tr>;
}

function DetailsModal({ value, loading, onClose, onReprocess, reprocessing }: { value?: NotificationEventDetails; loading: boolean; onClose: () => void; onReprocess: (id: string) => void; reprocessing: boolean }) {
  return <div className="modal-layer" role="presentation"><button className="modal-backdrop" type="button" aria-label="Zamknij szczegóły" onClick={onClose} /><div className="hospital-dialog email-dialog" role="dialog" aria-modal="true" aria-labelledby="email-details-title">
    <h2 id="email-details-title">Szczegóły zdarzenia</h2>{loading || !value ? <p>Ładowanie…</p> : <>
      <dl className="audit-details"><Detail label="eventKey" value={value.eventKey} /><Detail label="Typ sprawy" value={value.entityType === 'REPAIR' ? 'Naprawa' : 'Przegląd'} /><Detail label="Numer biznesowy" value={value.businessNumber || String(value.payload.businessNumber ?? '—')} /><Detail label="Status klienta" value={value.customerLabel} /><Detail label="Szpital" value={value.hospital.name} /><Detail label="Data" value={formatDate(value.occurredAt)} /><Detail label="Powód blokady" value={value.blockedReasonMessage ?? '—'} /></dl>
      <h3>Bezpieczny payload</h3><pre className="payload-preview">{JSON.stringify(value.payload, null, 2)}</pre>
      <h3>Wiadomości</h3>{value.deliveries.length ? <ul className="delivery-list">{value.deliveries.map((item) => <li key={item.id}><strong>{item.recipientName ?? item.recipientEmail}</strong><span>{item.recipientEmail}</span><StatusBadge value={item.status} label={deliveryStatusLabels[item.status]} /><span>Próby: {item.attempts} · providerId: {item.providerId ?? '—'}</span></li>)}</ul> : <p>Nie utworzono wiadomości.</p>}</>}
    <div className="dialog-actions">{value && (value.status === 'BLOCKED' || value.status === 'FAILED') && <button className="primary-button compact-button" disabled={reprocessing} type="button" onClick={() => onReprocess(value.id)}>Przetwórz ponownie</button>}<button className="secondary-button compact-button" type="button" onClick={onClose}>Zamknij</button></div>
  </div></div>;
}

function StatusBadge({ value, label }: { value: string; label: string }) {
  const tone = ['READY', 'DELIVERED', 'COMPLETED'].includes(value) ? 'positive' : ['BLOCKED', 'FAILED', 'BOUNCED', 'COMPLAINED'].includes(value) ? 'negative' : 'neutral';
  return <span className={`status-badge ${tone}`}>{label}</span>;
}
function Filter({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: string[][] }) {
  const id = `email-filter-${label.replace(/\s/g, '-')}`;
  return <div className="hospital-filter"><label htmlFor={id}>{label}</label><select id={id} value={value} onChange={(event) => onChange(event.target.value)}><option value="">Wszystkie</option>{options.map(([key, text]) => <option key={key} value={key}>{text}</option>)}</select></div>;
}
function Detail({ label, value }: { label: string; value: string }) { return <><dt>{label}</dt><dd>{value}</dd></>; }
function formatDate(value: string) { return new Intl.DateTimeFormat('pl-PL', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)); }
