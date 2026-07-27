import { useQuery } from '@tanstack/react-query';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { ApiError } from '../api';
import { deviceQueryOptions, useCurrentUser } from '../query';

export function DeviceDetailsPage() {
  const { id = '' } = useParams();
  const { data: user } = useCurrentUser();
  const location = useLocation();
  const navigate = useNavigate();
  const device = useQuery(deviceQueryOptions(user?.activeHospital?.id ?? '', id));
  const back = () => {
    const state = location.state as { listSearch?: string } | null;
    navigate(`/app/devices${state?.listSearch ?? ''}`);
  };

  if (device.isPending) {
    return (
      <section className="device-details">
        <div className="detail-skeleton" aria-label="Ładowanie urządzenia" />
      </section>
    );
  }

  if (device.isError) {
    const status = device.error instanceof ApiError ? device.error.status : 500;
    return (
      <section className="device-details">
        <button className="back-link" type="button" onClick={back}>
          ← Wróć do urządzeń
        </button>
        <div className="empty-card" role="alert">
          <h1>
            {status === 403 || status === 404
              ? 'Nie znaleziono urządzenia'
              : 'Nie udało się pobrać urządzenia'}
          </h1>
          <p>
            {status === 403 || status === 404
              ? 'Urządzenie nie istnieje lub nie masz do niego dostępu.'
              : 'Wystąpił chwilowy błąd serwera.'}
          </p>
          {status >= 500 && (
            <button
              className="primary-button compact-button"
              onClick={() => device.refetch()}
            >
              Spróbuj ponownie
            </button>
          )}
        </div>
      </section>
    );
  }

  const item = device.data;
  return (
    <section className="device-details">
      <button className="back-link" type="button" onClick={back}>
        ← Wróć do urządzeń
      </button>
      <div className="page-title-row">
        <div>
          <p className="eyebrow">Urządzenie</p>
          <h1>{item.name}</h1>
          <p>{item.manufacturer ?? 'Brak danych'}</p>
        </div>
      </div>
      <dl className="device-facts">
        <Fact label="Producent" value={item.manufacturer} />
        <Fact label="Model" value={item.model} />
        <Fact label="Numer seryjny" value={item.serialNo} />
        <Fact label="Numer inwentarzowy" value={item.inventoryNo} />
        <Fact label="Kategoria" value={item.category} />
        <Fact label="Szpital" value={item.hospital.name} />
        <Fact
          label="Oddział"
          value={item.department?.name ?? 'Oddział nieprzypisany'}
        />
      </dl>
      <div className="device-section-grid">
        <section className="detail-card">
          <h2>Naprawy</h2>
          {item.repairs.length === 0 ? (
            <p>Brak napraw przypisanych do urządzenia.</p>
          ) : (
            <ul className="device-repairs">
              {item.repairs.map((repair) => (
                <li key={repair.id}>
                  <button type="button" onClick={() => navigate(`/app/repairs/${repair.id}`)}>
                    <strong>{repair.businessNumber}</strong>
                    <span>{repair.customerLabel}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
        <EmptySection title="Przeglądy" text="Brak przeglądów przypisanych do urządzenia." />
        <EmptySection title="Dokumenty" text="Brak dokumentów przypisanych do urządzenia." />
      </div>
    </section>
  );
}

function Fact({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value ?? 'Brak danych'}</dd>
    </div>
  );
}

function EmptySection({ title, text }: { title: string; text: string }) {
  return (
    <section className="detail-card">
      <h2>{title}</h2>
      <p>{text}</p>
    </section>
  );
}
