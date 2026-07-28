import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { InspectionDetailsPage } from '../pages/InspectionDetailsPage';
import { InspectionsPage } from '../pages/InspectionsPage';
import { inspectionsQueryOptions } from '../query';

const hospitalId = '348f0785-8427-4d33-97ee-61cae8e91e42';
const inspectionId = '93027cb0-b139-4ed0-8328-a00328368d8a';
const user = {
  id: 'user-id',
  email: 'user@example.com',
  status: 'ACTIVE',
  systemRole: 'USER',
  memberships: [],
  activeHospital: { id: hospitalId, name: 'Szpital Miejski', role: 'HOSPITAL_USER' },
};
const inspection = {
  id: inspectionId,
  businessNumber: 'P-2026-0081',
  customerStatusCode: 'PLANNED',
  customerLabel: 'Zaplanowany',
  result: null,
  isTerminal: false,
  plannedAt: '2026-08-20T08:00:00Z',
  performedAt: null,
  dueAt: '2026-07-20T08:00:00Z',
  updatedAt: '2026-07-28T10:00:00Z',
  isOverdue: true,
  device: { id: 'device-id', name: 'Nawilżacz MR850', serialNo: 'AA-8129', inventoryNo: 'INV-4881' },
  department: { id: 'department-id', name: 'Neonatologia' },
};

afterEach(() => vi.unstubAllGlobals());

describe('Portal inspections UI', () => {
  it('shows inspections, customer status and textual overdue information', async () => {
    mockApi();
    renderPages('/app/inspections');
    expect(await screen.findByText('P-2026-0081')).toBeVisible();
    expect(screen.getAllByText('Zaplanowany').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Po terminie').some((element) =>
      element.classList.contains('repair-status-danger'))).toBe(true);
    expect(screen.queryByText('AIRTABLE_TECHNICAL_STATUS')).not.toBeInTheDocument();
  });

  it('stores filters in the URL and sends next30days', async () => {
    const fetchMock = mockApi();
    const interaction = userEvent.setup();
    renderPages('/app/inspections');
    await screen.findByText('P-2026-0081');
    await interaction.type(screen.getByRole('searchbox'), '0081');
    await interaction.selectOptions(screen.getByLabelText('Termin'), 'next30days');
    await waitFor(() => {
      expect(screen.getByTestId('location')).toHaveTextContent('search=0081');
      expect(screen.getByTestId('location')).toHaveTextContent('due=next30days');
      expect(fetchMock.mock.calls.some(([input]) =>
        String(input).includes('due=next30days'))).toBe(true);
    });
  });

  it('opens details, shows history and preserves filters on return', async () => {
    mockApi();
    const interaction = userEvent.setup();
    renderPages('/app/inspections?search=0081&page=2');
    await interaction.click((await screen.findByText('P-2026-0081')).closest('tr')!);
    expect(await screen.findByRole('heading', { name: 'Historia statusów' })).toBeVisible();
    expect(screen.getAllByText('Zaplanowany').length).toBeGreaterThan(0);
    expect(screen.queryByText('AIRTABLE_TECHNICAL_STATUS')).not.toBeInTheDocument();
    await interaction.click(screen.getByRole('button', { name: /Wróć do przeglądów/ }));
    await waitFor(() => expect(screen.getByTestId('location'))
      .toHaveTextContent('/app/inspections?search=0081&page=2'));
  });

  it('includes activeHospitalId in inspection query keys', () => {
    const first = inspectionsQueryOptions('hospital-a', { page: 1, pageSize: 25 });
    const second = inspectionsQueryOptions('hospital-b', { page: 1, pageSize: 25 });
    expect(first.queryKey).not.toEqual(second.queryKey);
    expect(first.queryKey).toContain('hospital-a');
    expect(second.queryKey).toContain('hospital-b');
  });
});

function renderPages(entry: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route path="/app/inspections" element={<><InspectionsPage /><Location /></>} />
          <Route path="/app/inspections/:id" element={<><InspectionDetailsPage /><Location /></>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function Location() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}{location.search}</output>;
}

function mockApi() {
  const fetchMock = vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith('/me')) return json(user);
    if (url.endsWith('/departments')) {
      return json({ items: [{ id: 'department-id', name: 'Neonatologia' }] });
    }
    if (url.includes(`/inspections/${inspectionId}`)) {
      return json({
        ...inspection,
        completedAt: null,
        customerDescription: 'Przegląd został zaplanowany.',
        sourceStatus: undefined,
        device: {
          ...inspection.device,
          manufacturer: 'Fisher & Paykel',
          model: 'MR850',
          department: inspection.department,
          hospital: { id: hospitalId, name: 'Szpital Miejski' },
        },
        statusHistory: [{ id: 'history-id', statusCode: 'PLANNED', label: 'Zaplanowany', changedAt: '2026-07-20T08:00:00Z' }],
        documents: [],
      });
    }
    if (url.includes('/inspections?')) {
      return json({ items: [inspection], page: 1, pageSize: 25, totalCount: 1 });
    }
    throw new Error(`Unexpected request: ${url}`);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function json(body: unknown): Promise<Response> {
  return Promise.resolve({ ok: true, status: 200, json: async () => body } as Response);
}
