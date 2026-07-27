import { useQuery } from '@tanstack/react-query';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { repairQueryOptions, useCurrentUser } from '../query';
import { formatDate, StatusBadge } from './RepairsPage';

export function RepairDetailsPage() {
  const { id = '' } = useParams();
  const { data: user } = useCurrentUser();
  const location = useLocation();
  const navigate = useNavigate();
  const repair = useQuery(repairQueryOptions(user?.activeHospital?.id ?? '', id));
  const back = () => {
    const state = location.state as { listSearch?: string } | null;
    navigate(`/app/repairs${state?.listSearch ?? ''}`);
  };
  if (repair.isPending) return <div className="detail-skeleton" aria-label="Ładowanie naprawy" />;
  if (repair.isError) {
    return <section>
      <button className="back-link" onClick={back}>← Wróć do napraw</button>
      <div className="empty-card"><h1>Nie znaleziono naprawy</h1><p>Naprawa nie istnieje lub nie masz do niej dostępu.</p></div>
    </section>;
  }
  const item = repair.data;
  return <section className="repair-details">
    <button className="back-link" onClick={back}>← Wróć do napraw</button>
    <div className="page-title-row">
      <div><p className="eyebrow">Naprawa</p><h1>{item.businessNumber}</h1><p>{item.device.name}</p></div>
      <StatusBadge code={item.customerStatusCode} label={item.customerLabel} />
    </div>
    <dl className="device-facts">
      <Fact label="Data zgłoszenia" value={formatDate(item.reportedAt)} />
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
              <StatusBadge code={entry.statusCode} label={entry.label} />
              <time dateTime={entry.changedAt}>{formatDate(entry.changedAt)}</time>
            </li>)}
          </ol>
        ) : <p>Brak historii statusów.</p>}
      </section>
      <section className="detail-card"><h2>Dokumenty</h2><p>Brak dokumentów przypisanych do naprawy.</p></section>
    </div>
  </section>;
}

function Fact({ label, value }: { label: string; value: string | null }) {
  return <div><dt>{label}</dt><dd>{value ?? 'Brak danych'}</dd></div>;
}
