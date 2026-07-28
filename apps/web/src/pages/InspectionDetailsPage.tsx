import { useQuery } from '@tanstack/react-query';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { inspectionQueryOptions, useCurrentUser } from '../query';
import {
  formatInspectionDate,
  InspectionStatusBadge,
  OverdueBadge,
} from './InspectionsPage';

export function InspectionDetailsPage() {
  const { id = '' } = useParams();
  const { data: user } = useCurrentUser();
  const location = useLocation();
  const navigate = useNavigate();
  const inspection = useQuery(
    inspectionQueryOptions(user?.activeHospital?.id ?? '', id),
  );
  const back = () => {
    const state = location.state as { listSearch?: string } | null;
    navigate(`/app/inspections${state?.listSearch ?? ''}`);
  };
  if (inspection.isPending) {
    return <div className="detail-skeleton" aria-label="Ładowanie przeglądu" />;
  }
  if (inspection.isError) {
    return <section>
      <button className="back-link" onClick={back}>← Wróć do przeglądów</button>
      <div className="empty-card"><h1>Nie znaleziono przeglądu</h1><p>Przegląd nie istnieje lub nie masz do niego dostępu.</p></div>
    </section>;
  }
  const item = inspection.data;
  return <section className="repair-details">
    <button className="back-link" onClick={back}>← Wróć do przeglądów</button>
    <div className="page-title-row">
      <div><p className="eyebrow">Przegląd</p><h1>{item.businessNumber}</h1><p>{item.device.name}</p></div>
      <div className="inspection-badges">
        <InspectionStatusBadge code={item.customerStatusCode} label={item.customerLabel} />
        {item.isOverdue && <OverdueBadge />}
      </div>
    </div>
    <dl className="device-facts">
      <Fact label="Rezultat" value={item.result} />
      <Fact label="Planowany termin" value={formatInspectionDate(item.plannedAt)} />
      <Fact label="Data wykonania" value={formatInspectionDate(item.performedAt)} />
      <Fact label="Przegląd do" value={formatInspectionDate(item.dueAt)} />
      <Fact label="Urządzenie" value={item.device.name} />
      <Fact label="Producent" value={item.device.manufacturer} />
      <Fact label="Model" value={item.device.model} />
      <Fact label="Numer seryjny" value={item.device.serialNo} />
      <Fact label="Numer inwentarzowy" value={item.device.inventoryNo} />
      <Fact label="Szpital" value={item.device.hospital.name} />
      <Fact label="Oddział" value={item.device.department?.name ?? 'Oddział nieprzypisany'} />
    </dl>
    <div className="repair-detail-grid">
      <section className="detail-card"><h2>Opis dla klienta</h2><p>{item.customerDescription ?? 'Brak opisu dla klienta.'}</p></section>
      <section className="detail-card">
        <h2>Historia statusów</h2>
        {item.statusHistory.length ? (
          <ol className="status-timeline">
            {item.statusHistory.map((entry) => <li key={entry.id}>
              <InspectionStatusBadge code={entry.statusCode} label={entry.label} />
              <time dateTime={entry.changedAt}>{formatInspectionDate(entry.changedAt)}</time>
            </li>)}
          </ol>
        ) : <p>Brak historii statusów.</p>}
      </section>
      <section className="detail-card"><h2>Dokumenty</h2><p>Brak dokumentów przypisanych do przeglądu.</p></section>
    </div>
  </section>;
}

function Fact({ label, value }: { label: string; value: string | null }) {
  return <div><dt>{label}</dt><dd>{value ?? 'Brak danych'}</dd></div>;
}
