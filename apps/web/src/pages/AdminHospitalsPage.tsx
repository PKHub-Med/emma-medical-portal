import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import {
  createAdminHospital,
  updateAdminHospital,
  type AdminHospital,
  type AdminHospitalsParams,
} from '../api';
import {
  adminHospitalsQueryKey,
  adminHospitalsQueryOptions,
} from '../query';

const PAGE_SIZE = 25;

const hospitalFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Nazwa szpitala jest wymagana.')
    .min(3, 'Nazwa szpitala musi mieć co najmniej 3 znaki.')
    .max(200, 'Nazwa szpitala może mieć maksymalnie 200 znaków.'),
});

type HospitalFormValues = z.infer<typeof hospitalFormSchema>;
type ActivityFilter = 'all' | 'active' | 'inactive';

export function AdminHospitalsPage() {
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [activity, setActivity] = useState<ActivityFilter>('all');
  const [dialog, setDialog] = useState<
    { mode: 'create' } | { mode: 'edit'; hospital: AdminHospital } | null
  >(null);

  const params: AdminHospitalsParams = {
    page,
    pageSize: PAGE_SIZE,
    ...(search ? { search } : {}),
    ...(activity === 'all'
      ? {}
      : { active: activity === 'active' }),
  };
  const hospitalsQuery = useQuery(adminHospitalsQueryOptions(params));
  const queryClient = useQueryClient();
  const updateMutation = useMutation({
    mutationFn: updateAdminHospital,
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: adminHospitalsQueryKey,
      });
    },
  });

  const totalPages = Math.max(
    1,
    Math.ceil((hospitalsQuery.data?.totalCount ?? 0) / PAGE_SIZE),
  );

  const submitSearch = (event: React.FormEvent) => {
    event.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
  };

  const updateBoolean = (
    hospital: AdminHospital,
    field: 'active' | 'portalEnabled',
  ) => {
    updateMutation.mutate({
      id: hospital.id,
      data: { [field]: !hospital[field] },
    });
  };

  return (
    <section className="hospitals-page" aria-labelledby="hospitals-title">
      <div className="page-title-row">
        <div>
          <p className="eyebrow">Administracja</p>
          <h1 id="hospitals-title">Szpitale</h1>
          <p>Zarządzaj dostępnością szpitali w systemie Emma.</p>
        </div>
        <button
          className="primary-button compact-button"
          type="button"
          onClick={() => setDialog({ mode: 'create' })}
        >
          <span aria-hidden="true">+</span>
          Dodaj szpital
        </button>
      </div>

      <div className="hospital-toolbar">
        <form className="hospital-search" onSubmit={submitSearch}>
          <label htmlFor="hospital-search">Wyszukaj szpital</label>
          <div>
            <input
              id="hospital-search"
              type="search"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Wpisz nazwę szpitala"
            />
            <button className="secondary-button compact-button" type="submit">
              Szukaj
            </button>
          </div>
        </form>
        <div className="hospital-filter">
          <label htmlFor="activity-filter">Aktywność</label>
          <select
            id="activity-filter"
            value={activity}
            onChange={(event) => {
              setPage(1);
              setActivity(event.target.value as ActivityFilter);
            }}
          >
            <option value="all">Wszystkie</option>
            <option value="active">Aktywne</option>
            <option value="inactive">Nieaktywne</option>
          </select>
        </div>
      </div>

      {updateMutation.isError && (
        <div className="inline-error" role="alert">
          Nie udało się zaktualizować szpitala. Spróbuj ponownie.
        </div>
      )}

      <div className="hospital-table-card">
        {hospitalsQuery.isPending ? (
          <HospitalTableSkeleton />
        ) : hospitalsQuery.isError ? (
          <div className="table-message error-message" role="alert">
            <strong>Nie udało się pobrać listy szpitali.</strong>
            <span>Sprawdź połączenie i spróbuj ponownie.</span>
            <button
              className="secondary-button compact-button"
              type="button"
              onClick={() => void hospitalsQuery.refetch()}
            >
              Spróbuj ponownie
            </button>
          </div>
        ) : hospitalsQuery.data.items.length === 0 ? (
          <div className="table-message">
            <strong>Nie znaleziono szpitali</strong>
            <span>Zmień wyszukiwanie lub wybrany filtr.</span>
          </div>
        ) : (
          <>
            <div className="table-scroll">
              <table className="hospital-table">
                <thead>
                  <tr>
                    <th scope="col">Szpital</th>
                    <th scope="col">Status</th>
                    <th scope="col">Portal</th>
                    <th scope="col">Oddziały</th>
                    <th scope="col">Użytkownicy</th>
                    <th scope="col">Akcje</th>
                  </tr>
                </thead>
                <tbody>
                  {hospitalsQuery.data.items.map((hospital) => {
                    const rowIsUpdating =
                      updateMutation.isPending &&
                      updateMutation.variables?.id === hospital.id;

                    return (
                      <tr key={hospital.id}>
                        <th scope="row">{hospital.name}</th>
                        <td>
                          <StatusBadge
                            enabled={hospital.active}
                            enabledLabel="Aktywny"
                            disabledLabel="Nieaktywny"
                          />
                        </td>
                        <td>
                          <StatusBadge
                            enabled={hospital.portalEnabled}
                            enabledLabel="Włączony"
                            disabledLabel="Wyłączony"
                          />
                        </td>
                        <td>{hospital.departmentsCount}</td>
                        <td>{hospital.membershipsCount}</td>
                        <td>
                          <div className="row-actions">
                            <Link to={`/admin/hospitals/${hospital.id}`}>
                              Konfiguruj
                            </Link>
                            <button
                              type="button"
                              onClick={() =>
                                setDialog({ mode: 'edit', hospital })
                              }
                              disabled={rowIsUpdating}
                            >
                              Zmień nazwę
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                updateBoolean(hospital, 'active')
                              }
                              disabled={rowIsUpdating}
                            >
                              {hospital.active
                                ? 'Dezaktywuj'
                                : 'Aktywuj'}
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                updateBoolean(hospital, 'portalEnabled')
                              }
                              disabled={rowIsUpdating}
                            >
                              {hospital.portalEnabled
                                ? 'Wyłącz portal'
                                : 'Włącz portal'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <nav className="pagination" aria-label="Paginacja szpitali">
              <span>
                Strona {hospitalsQuery.data.page} z {totalPages} ·{' '}
                {hospitalsQuery.data.totalCount} wyników
              </span>
              <div>
                <button
                  className="secondary-button compact-button"
                  type="button"
                  onClick={() => setPage((current) => current - 1)}
                  disabled={page <= 1 || hospitalsQuery.isFetching}
                >
                  Poprzednia
                </button>
                <button
                  className="secondary-button compact-button"
                  type="button"
                  onClick={() => setPage((current) => current + 1)}
                  disabled={
                    page >= totalPages || hospitalsQuery.isFetching
                  }
                >
                  Następna
                </button>
              </div>
            </nav>
          </>
        )}
      </div>

      {dialog && (
        <HospitalDialog
          mode={dialog.mode}
          hospital={dialog.mode === 'edit' ? dialog.hospital : undefined}
          onClose={() => setDialog(null)}
        />
      )}
    </section>
  );
}

function StatusBadge({
  enabled,
  enabledLabel,
  disabledLabel,
}: {
  enabled: boolean;
  enabledLabel: string;
  disabledLabel: string;
}) {
  return (
    <span className={`status-badge ${enabled ? 'positive' : 'neutral'}`}>
      <span className="status-dot" aria-hidden="true" />
      {enabled ? enabledLabel : disabledLabel}
    </span>
  );
}

function HospitalTableSkeleton() {
  return (
    <div
      className="table-skeleton"
      role="status"
      aria-label="Ładowanie listy szpitali"
    >
      {[0, 1, 2, 3].map((row) => (
        <div className="skeleton-row" key={row}>
          {[0, 1, 2, 3, 4, 5].map((column) => (
            <span key={column} />
          ))}
        </div>
      ))}
    </div>
  );
}

function HospitalDialog({
  mode,
  hospital,
  onClose,
}: {
  mode: 'create' | 'edit';
  hospital?: AdminHospital;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<HospitalFormValues>({
    defaultValues: { name: hospital?.name ?? '' },
  });
  const mutation = useMutation({
    mutationFn: (values: HospitalFormValues) =>
      mode === 'create'
        ? createAdminHospital(values)
        : updateAdminHospital({
            id: hospital!.id,
            data: values,
          }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: adminHospitalsQueryKey,
      });
      onClose();
    },
  });

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !mutation.isPending) {
        onClose();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [mutation.isPending, onClose]);

  const submit = (values: HospitalFormValues) => {
    const validation = hospitalFormSchema.safeParse(values);

    if (!validation.success) {
      setError('name', {
        type: 'validation',
        message: validation.error.issues[0]?.message,
      });
      return;
    }

    mutation.mutate(validation.data);
  };

  const title =
    mode === 'create' ? 'Dodaj szpital' : 'Zmień nazwę szpitala';

  return (
    <div className="modal-layer">
      <button
        className="modal-backdrop"
        type="button"
        aria-label="Zamknij formularz"
        onClick={onClose}
        disabled={mutation.isPending}
      />
      <section
        className="hospital-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="hospital-dialog-title"
      >
        <p className="eyebrow">Szpitale</p>
        <h2 id="hospital-dialog-title">{title}</h2>
        <form onSubmit={handleSubmit(submit)} noValidate>
          <div className="field">
            <label htmlFor="hospital-name">Nazwa szpitala</label>
            <input
              id="hospital-name"
              autoFocus
              maxLength={200}
              aria-invalid={Boolean(errors.name)}
              aria-describedby={
                errors.name ? 'hospital-name-error' : undefined
              }
              {...register('name')}
            />
            {errors.name && (
              <p className="field-error" id="hospital-name-error">
                {errors.name.message}
              </p>
            )}
          </div>
          {mutation.isError && (
            <div className="inline-error" role="alert">
              Nie udało się zapisać szpitala. Spróbuj ponownie.
            </div>
          )}
          <div className="dialog-actions">
            <button
              className="secondary-button compact-button"
              type="button"
              onClick={onClose}
              disabled={mutation.isPending}
            >
              Anuluj
            </button>
            <button
              className="primary-button compact-button"
              type="submit"
              disabled={mutation.isPending}
            >
              {mutation.isPending
                ? 'Zapisywanie…'
                : mode === 'create'
                  ? 'Dodaj'
                  : 'Zapisz'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
