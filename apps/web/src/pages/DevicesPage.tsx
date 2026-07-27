import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { ApiError } from '../api';
import {
  departmentsQueryOptions,
  devicesQueryOptions,
  useCurrentUser,
} from '../query';

const PAGE_SIZE = 25;

export function DevicesPage() {
  const { data: user } = useCurrentUser();
  const hospitalId = user?.activeHospital?.id ?? '';
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const page = positivePage(searchParams.get('page'));
  const search = searchParams.get('search') ?? '';
  const departmentId = searchParams.get('departmentId') ?? '';
  const manufacturer = searchParams.get('manufacturer') ?? '';
  const devices = useQuery(
    devicesQueryOptions(hospitalId, {
      page,
      pageSize: PAGE_SIZE,
      search: search || undefined,
      departmentId: departmentId || undefined,
      manufacturer: manufacturer || undefined,
    }),
  );
  const departments = useQuery(departmentsQueryOptions(hospitalId));
  const manufacturers = useMemo(
    () =>
      [...new Set(
        (devices.data?.items ?? [])
          .map((device) => device.manufacturer)
          .filter((value): value is string => Boolean(value)),
      )].sort((a, b) => a.localeCompare(b, 'pl')),
    [devices.data?.items],
  );
  if (manufacturer && !manufacturers.includes(manufacturer)) {
    manufacturers.unshift(manufacturer);
  }

  const update = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== 'page') next.delete('page');
    setSearchParams(next);
  };
  const totalPages = Math.max(
    1,
    Math.ceil((devices.data?.totalCount ?? 0) / PAGE_SIZE),
  );

  return (
    <section className="devices-page">
      <div className="page-title-row">
        <div>
          <p className="eyebrow">Ewidencja</p>
          <h1>Urządzenia</h1>
          <p>Lista urządzeń przypisanych do wybranego szpitala.</p>
        </div>
      </div>

      <div className="devices-toolbar" aria-label="Filtry urządzeń">
        <label className="device-search">
          <span>Wyszukaj</span>
          <input
            type="search"
            value={search}
            placeholder="Nazwa, model lub numer"
            onChange={(event) => update('search', event.target.value)}
          />
        </label>
        <label>
          <span>Oddział</span>
          <select
            value={departmentId}
            onChange={(event) => update('departmentId', event.target.value)}
          >
            <option value="">Wszystkie oddziały</option>
            {departments.data?.items.map((department) => (
              <option key={department.id} value={department.id}>
                {department.name}
              </option>
            ))}
          </select>
        </label>
        {(manufacturers.length > 0 || manufacturer) && (
          <label>
            <span>Producent</span>
            <select
              value={manufacturer}
              onChange={(event) => update('manufacturer', event.target.value)}
            >
              <option value="">Wszyscy producenci</option>
              {manufacturers.map((name) => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          </label>
        )}
        <button
          type="button"
          className="secondary-button compact-button"
          onClick={() => setSearchParams({})}
          disabled={!searchParams.size}
        >
          Wyczyść filtry
        </button>
      </div>

      {devices.isPending ? (
        <DeviceSkeleton />
      ) : devices.isError ? (
        <QueryError error={devices.error} retry={() => devices.refetch()} />
      ) : devices.data.items.length === 0 ? (
        <div className="empty-card">
          <h2>Brak urządzeń</h2>
          <p>Nie znaleziono urządzeń spełniających wybrane kryteria.</p>
        </div>
      ) : (
        <>
          <div className="table-wrap">
            <table className="data-table devices-table">
              <thead>
                <tr>
                  <th>Urządzenie</th>
                  <th>Producent i model</th>
                  <th>Numer seryjny</th>
                  <th>Numer inwentarzowy</th>
                  <th>Oddział</th>
                </tr>
              </thead>
              <tbody>
                {devices.data.items.map((device) => (
                  <tr
                    key={device.id}
                    tabIndex={0}
                    onClick={() =>
                      navigate(`/app/devices/${device.id}`, {
                        state: { listSearch: location.search },
                      })
                    }
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        navigate(`/app/devices/${device.id}`, {
                          state: { listSearch: location.search },
                        });
                      }
                    }}
                  >
                    <td><strong>{device.name}</strong></td>
                    <td>{joined(device.manufacturer, device.model)}</td>
                    <td>{device.serialNo ?? 'Brak danych'}</td>
                    <td>{device.inventoryNo ?? 'Brak danych'}</td>
                    <td>{device.department?.name ?? 'Oddział nieprzypisany'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <nav className="pagination" aria-label="Paginacja urządzeń">
            <p>
              Strona {devices.data.page} z {totalPages} · {devices.data.totalCount}{' '}
              urządzeń
            </p>
            <div>
              <button
                className="secondary-button compact-button"
                disabled={page <= 1}
                onClick={() => update('page', String(page - 1))}
              >
                Poprzednia
              </button>
              <button
                className="secondary-button compact-button"
                disabled={page >= totalPages}
                onClick={() => update('page', String(page + 1))}
              >
                Następna
              </button>
            </div>
          </nav>
        </>
      )}
    </section>
  );
}

function DeviceSkeleton() {
  return (
    <div className="device-skeleton" aria-label="Ładowanie urządzeń">
      {Array.from({ length: 5 }, (_, index) => <span key={index} />)}
    </div>
  );
}

function QueryError({ error, retry }: { error: Error; retry: () => void }) {
  const status = error instanceof ApiError ? error.status : 500;
  if (status === 403 || status === 404) {
    return (
      <div className="empty-card" role="alert">
        <h2>Brak dostępu lub urządzeń</h2>
        <p>Nie można wyświetlić danych dla wybranego szpitala.</p>
      </div>
    );
  }
  return (
    <div className="empty-card" role="alert">
      <h2>Nie udało się pobrać urządzeń</h2>
      <button className="primary-button compact-button" onClick={retry}>
        Spróbuj ponownie
      </button>
    </div>
  );
}

function positivePage(value: string | null) {
  return value && /^\d+$/.test(value) && Number(value) > 0 ? Number(value) : 1;
}

function joined(...values: Array<string | null>) {
  return values.filter(Boolean).join(' · ') || 'Brak danych';
}
