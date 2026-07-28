import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { cloneElement, useEffect, useState, type ReactElement, type ReactNode } from 'react';
import {
  createStatusMapping,
  updateStatusMapping,
  type CreateStatusMappingInput,
  type StatusMapping,
  type StatusMappingEntityType,
  type StatusMappingsParams,
} from '../api';
import {
  statusMappingsQueryKey,
  statusMappingsQueryOptions,
} from '../query';

const PAGE_SIZE = 25;
type BooleanFilter = 'all' | 'true' | 'false';

export function AdminStatusesPage() {
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [entityType, setEntityType] = useState<'all' | StatusMappingEntityType>('all');
  const [active, setActive] = useState<BooleanFilter>('all');
  const [sendEmail, setSendEmail] = useState<BooleanFilter>('all');
  const [dialog, setDialog] = useState<StatusMapping | 'create' | null>(null);
  const queryClient = useQueryClient();

  const params: StatusMappingsParams = {
    page,
    pageSize: PAGE_SIZE,
    ...(search ? { search } : {}),
    ...(entityType === 'all' ? {} : { sourceEntityType: entityType }),
    ...(active === 'all' ? {} : { active: active === 'true' }),
    ...(sendEmail === 'all' ? {} : { sendEmail: sendEmail === 'true' }),
  };
  const mappings = useQuery(statusMappingsQueryOptions(params));
  const toggle = useMutation({
    mutationFn: (mapping: StatusMapping) =>
      updateStatusMapping({
        id: mapping.id,
        data: {
          sourceStatus: mapping.sourceStatus,
          customerStatusCode: mapping.customerStatusCode,
          customerLabel: mapping.customerLabel,
          emailTemplateId: mapping.emailTemplateId,
          sendEmail: mapping.sendEmail,
          isTerminal: mapping.isTerminal,
          requiresAction: mapping.requiresAction,
          active: !mapping.active,
        },
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: statusMappingsQueryKey }),
  });
  const totalPages = Math.max(
    1,
    Math.ceil((mappings.data?.totalCount ?? 0) / PAGE_SIZE),
  );

  return (
    <section aria-labelledby="status-mappings-title">
      <div className="page-title-row">
        <div>
          <p className="eyebrow">Administracja</p>
          <h1 id="status-mappings-title">Mapowanie statusów</h1>
          <p>
            Określ, jak techniczne statusy źródłowe mają być prezentowane
            użytkownikom szpitala.
          </p>
        </div>
        <button className="primary-button compact-button" type="button" onClick={() => setDialog('create')}>
          <span aria-hidden="true">+</span> Dodaj mapowanie
        </button>
      </div>

      <div className="status-mapping-toolbar">
        <form
          className="hospital-search"
          onSubmit={(event) => {
            event.preventDefault();
            setPage(1);
            setSearch(searchInput.trim());
          }}
        >
          <label htmlFor="mapping-search">Wyszukaj mapowanie</label>
          <div>
            <input
              id="mapping-search"
              type="search"
              value={searchInput}
              placeholder="Status, kod lub etykieta"
              onChange={(event) => setSearchInput(event.target.value)}
            />
            <button className="secondary-button compact-button" type="submit">Szukaj</button>
          </div>
        </form>
        <Filter label="Typ" value={entityType} onChange={(value) => {
          setPage(1);
          setEntityType(value as typeof entityType);
        }}>
          <option value="all">Wszystkie</option>
          <option value="REPAIR">Naprawa</option>
          <option value="INSPECTION">Przegląd</option>
        </Filter>
        <Filter label="Aktywność" value={active} onChange={(value) => {
          setPage(1);
          setActive(value as BooleanFilter);
        }}>
          <option value="all">Wszystkie</option>
          <option value="true">Aktywne</option>
          <option value="false">Nieaktywne</option>
        </Filter>
        <Filter label="Wysyłka e-mail" value={sendEmail} onChange={(value) => {
          setPage(1);
          setSendEmail(value as BooleanFilter);
        }}>
          <option value="all">Wszystkie</option>
          <option value="true">Włączona</option>
          <option value="false">Wyłączona</option>
        </Filter>
      </div>

      {toggle.isError && <div className="inline-error" role="alert">Nie udało się zmienić aktywności mapowania.</div>}
      <div className="hospital-table-card">
        {mappings.isPending ? (
          <MappingSkeleton />
        ) : mappings.isError ? (
          <div className="table-message error-message" role="alert">
            <strong>Nie udało się pobrać mapowań statusów.</strong>
            <span>Sprawdź połączenie i spróbuj ponownie.</span>
            <button className="secondary-button compact-button" type="button" onClick={() => void mappings.refetch()}>
              Spróbuj ponownie
            </button>
          </div>
        ) : mappings.data.items.length === 0 ? (
          <div className="table-message">
            <strong>Nie dodano jeszcze mapowań statusów.</strong>
          </div>
        ) : (
          <>
            <div className="table-scroll">
              <table className="hospital-table status-mapping-table">
                <thead>
                  <tr>
                    <th>Typ</th>
                    <th>Status źródłowy</th>
                    <th>Status klienta</th>
                    <th>E-mail</th>
                    <th>Terminalny</th>
                    <th>Aktywność</th>
                    <th>Akcje</th>
                  </tr>
                </thead>
                <tbody>
                  {mappings.data.items.map((mapping) => (
                    <tr key={mapping.id}>
                      <td>{entityTypeLabel(mapping.sourceEntityType)}</td>
                      <th scope="row"><code>{mapping.sourceStatus}</code></th>
                      <td>
                        <strong>{mapping.customerLabel}</strong>
                        <small className="mapping-code">{mapping.customerStatusCode}</small>
                        {mapping.requiresAction && <small className="mapping-action">Wymaga działania klienta</small>}
                      </td>
                      <td>
                        <Badge positive={mapping.sendEmail}>
                          {mapping.sendEmail ? 'Wysyłka włączona' : 'Bez e-maila'}
                        </Badge>
                        {mapping.sendEmail && !mapping.emailTemplateId && (
                          <small className="mapping-warning">Brak szablonu</small>
                        )}
                      </td>
                      <td>
                        <Badge positive={mapping.isTerminal}>
                          {mapping.isTerminal ? 'Zamyka sprawę' : 'Status otwarty'}
                        </Badge>
                      </td>
                      <td>
                        <Badge positive={mapping.active}>
                          {mapping.active ? 'Aktywne' : 'Nieaktywne'}
                        </Badge>
                      </td>
                      <td>
                        <div className="row-actions">
                          <button type="button" onClick={() => setDialog(mapping)}>Edytuj</button>
                          <button
                            type="button"
                            disabled={toggle.isPending && toggle.variables?.id === mapping.id}
                            onClick={() => toggle.mutate(mapping)}
                          >
                            {mapping.active ? 'Dezaktywuj' : 'Aktywuj'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <nav className="pagination" aria-label="Paginacja mapowań statusów">
              <span>Strona {mappings.data.page} z {totalPages} · {mappings.data.totalCount} wyników</span>
              <div>
                <button className="secondary-button compact-button" type="button" disabled={page <= 1 || mappings.isFetching} onClick={() => setPage((value) => value - 1)}>Poprzednia</button>
                <button className="secondary-button compact-button" type="button" disabled={page >= totalPages || mappings.isFetching} onClick={() => setPage((value) => value + 1)}>Następna</button>
              </div>
            </nav>
          </>
        )}
      </div>

      {dialog && (
        <StatusMappingDialog
          mapping={dialog === 'create' ? undefined : dialog}
          onClose={() => setDialog(null)}
        />
      )}
    </section>
  );
}

function Filter({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <label className="hospital-filter">
      {label}
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {children}
      </select>
    </label>
  );
}

function Badge({ positive, children }: { positive: boolean; children: ReactNode }) {
  return <span className={`status-badge ${positive ? 'positive' : 'neutral'}`}>{children}</span>;
}

function MappingSkeleton() {
  return (
    <div className="table-skeleton" role="status" aria-label="Ładowanie mapowań statusów">
      {[0, 1, 2, 3].map((row) => (
        <div className="skeleton-row status-mapping-skeleton" key={row}>
          {[0, 1, 2, 3, 4, 5, 6].map((column) => <span key={column} />)}
        </div>
      ))}
    </div>
  );
}

const emptyForm: CreateStatusMappingInput = {
  sourceEntityType: 'REPAIR',
  sourceStatus: '',
  customerStatusCode: '',
  customerLabel: '',
  emailTemplateId: null,
  sendEmail: false,
  isTerminal: false,
  requiresAction: false,
  active: true,
};

function StatusMappingDialog({
  mapping,
  onClose,
}: {
  mapping?: StatusMapping;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [values, setValues] = useState<CreateStatusMappingInput>(
    mapping
      ? {
          sourceEntityType: mapping.sourceEntityType,
          sourceStatus: mapping.sourceStatus,
          customerStatusCode: mapping.customerStatusCode,
          customerLabel: mapping.customerLabel,
          emailTemplateId: mapping.emailTemplateId,
          sendEmail: mapping.sendEmail,
          isTerminal: mapping.isTerminal,
          requiresAction: mapping.requiresAction,
          active: mapping.active,
        }
      : emptyForm,
  );
  const [error, setError] = useState('');
  const mutation = useMutation({
    mutationFn: (input: CreateStatusMappingInput) =>
      mapping
        ? updateStatusMapping({
            id: mapping.id,
            data: {
              sourceStatus: input.sourceStatus,
              customerStatusCode: input.customerStatusCode,
              customerLabel: input.customerLabel,
              emailTemplateId: input.emailTemplateId,
              sendEmail: input.sendEmail,
              isTerminal: input.isTerminal,
              requiresAction: input.requiresAction,
              active: input.active,
            },
          })
        : createStatusMapping(input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: statusMappingsQueryKey });
      onClose();
    },
  });

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !mutation.isPending) onClose();
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [mutation.isPending, onClose]);

  const setText = (field: 'sourceStatus' | 'customerStatusCode' | 'customerLabel' | 'emailTemplateId', value: string) => {
    setValues((current) => ({
      ...current,
      [field]: field === 'customerStatusCode' ? value.toUpperCase() : value,
    }));
  };
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const sourceStatus = values.sourceStatus.trim();
    const customerStatusCode = values.customerStatusCode.trim().toUpperCase();
    const customerLabel = values.customerLabel.trim();
    const emailTemplateId = values.emailTemplateId?.trim() || null;
    if (!sourceStatus || sourceStatus.length > 200) {
      setError('Status źródłowy jest wymagany i może mieć maksymalnie 200 znaków.');
      return;
    }
    if (!customerStatusCode || customerStatusCode.length > 100 || !/^[A-Z0-9_]+$/.test(customerStatusCode)) {
      setError('Kod statusu klienta może zawierać tylko A-Z, 0-9 i znak podkreślenia.');
      return;
    }
    if (!customerLabel || customerLabel.length > 200) {
      setError('Etykieta dla klienta jest wymagana i może mieć maksymalnie 200 znaków.');
      return;
    }
    if (emailTemplateId && emailTemplateId.length > 100) {
      setError('ID szablonu e-mail może mieć maksymalnie 100 znaków.');
      return;
    }
    setError('');
    mutation.mutate({ ...values, sourceStatus, customerStatusCode, customerLabel, emailTemplateId });
  };

  return (
    <div className="modal-layer">
      <button className="modal-backdrop" type="button" aria-label="Zamknij formularz" onClick={onClose} disabled={mutation.isPending} />
      <section className="hospital-dialog status-mapping-dialog" role="dialog" aria-modal="true" aria-labelledby="mapping-dialog-title">
        <p className="eyebrow">Mapowanie statusów</p>
        <h2 id="mapping-dialog-title">{mapping ? 'Edytuj mapowanie' : 'Dodaj mapowanie'}</h2>
        <form onSubmit={submit} noValidate>
          <div className="mapping-form-grid">
            <Field label="Typ encji">
              <select
                value={values.sourceEntityType}
                disabled={Boolean(mapping) || mutation.isPending}
                onChange={(event) => setValues((current) => ({ ...current, sourceEntityType: event.target.value as StatusMappingEntityType }))}
              >
                <option value="REPAIR">Naprawa</option>
                <option value="INSPECTION">Przegląd</option>
              </select>
            </Field>
            <Field label="Status źródłowy" help="Ta wartość musi odpowiadać statusowi otrzymywanemu ze źródła danych.">
              <input value={values.sourceStatus} maxLength={200} onChange={(event) => setText('sourceStatus', event.target.value)} />
            </Field>
            <Field label="Kod statusu klienta" help="Stabilny kod techniczny używany przez frontend, np. IN_PROGRESS.">
              <input value={values.customerStatusCode} maxLength={100} onChange={(event) => setText('customerStatusCode', event.target.value)} />
            </Field>
            <Field label="Etykieta dla klienta">
              <input value={values.customerLabel} maxLength={200} onChange={(event) => setText('customerLabel', event.target.value)} />
            </Field>
            <Field label="ID szablonu e-mail">
              <input value={values.emailTemplateId ?? ''} maxLength={100} onChange={(event) => setText('emailTemplateId', event.target.value)} />
            </Field>
          </div>
          <div className="mapping-checkboxes">
            <Checkbox label="Wyślij e-mail" checked={values.sendEmail} onChange={(checked) => setValues((current) => ({ ...current, sendEmail: checked }))} />
            <Checkbox label="Status końcowy" checked={values.isTerminal} onChange={(checked) => setValues((current) => ({ ...current, isTerminal: checked }))} />
            <Checkbox label="Wymaga działania klienta" checked={values.requiresAction} onChange={(checked) => setValues((current) => ({ ...current, requiresAction: checked }))} />
            <Checkbox label="Aktywne" checked={values.active} onChange={(checked) => setValues((current) => ({ ...current, active: checked }))} />
          </div>
          {values.sendEmail && !values.emailTemplateId?.trim() && (
            <div className="mapping-email-warning" role="status">
              Wysyłka jest włączona, ale nie wskazano szablonu. Wiadomość nie będzie mogła zostać wysłana po uruchomieniu modułu e-mail.
            </div>
          )}
          {error && <div className="inline-error" role="alert">{error}</div>}
          {mutation.isError && <div className="inline-error" role="alert">Nie udało się zapisać mapowania. Sprawdź, czy taki status już nie istnieje.</div>}
          <div className="dialog-actions">
            <button className="secondary-button compact-button" type="button" onClick={onClose} disabled={mutation.isPending}>Anuluj</button>
            <button className="primary-button compact-button" type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? 'Zapisywanie…' : mapping ? 'Zapisz' : 'Dodaj'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function Field({ label, help, children }: { label: string; help?: string; children: ReactElement<{ id?: string }> }) {
  const id = `mapping-${label.toLowerCase().replace(/\s+/g, '-')}`;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {cloneElement(children, { id })}
      {help && <p className="field-help">{help}</p>}
    </div>
  );
}

function Checkbox({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      {label}
    </label>
  );
}

function entityTypeLabel(value: StatusMappingEntityType) {
  return value === 'REPAIR' ? 'Naprawa' : 'Przegląd';
}
