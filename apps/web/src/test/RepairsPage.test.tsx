import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RepairDetailsPage } from '../pages/RepairDetailsPage';
import { RepairsPage } from '../pages/RepairsPage';
import { repairsQueryOptions } from '../query';

const hospitalId = '348f0785-8427-4d33-97ee-61cae8e91e42';
const repairId = '93027cb0-b139-4ed0-8328-a00328368d8a';
const currentUser = {
  id: 'user-id',
  email: 'user@example.com',
  status: 'ACTIVE',
  systemRole: 'USER',
  memberships: [],
  activeHospital: { id: hospitalId, name: 'Szpital Miejski', role: 'HOSPITAL_USER' },
};
const repair = {
  id: repairId,
  businessNumber: 'N-2026-0142',
  customerStatusCode: 'IN_PROGRESS',
  customerLabel: 'W trakcie naprawy',
  isTerminal: false,
  reportedAt: '2026-07-19T08:00:00Z',
  updatedAt: '2026-07-27T10:00:00Z',
  device: { id: 'device-id', name: 'Respirator Airvo 3', serialNo: 'A3-9921', inventoryNo: 'INV-3317' },
  department: { id: 'department-id', name: 'SOR' },
};

afterEach(() => vi.unstubAllGlobals());

describe('Portal repairs UI', () => {
  it('shows repairs and a textual status', async () => {
    mockApi();
    renderPages('/app/repairs');
    expect(await screen.findByText('N-2026-0142')).toBeVisible();
    expect(screen.getAllByText('W trakcie naprawy').length).toBeGreaterThan(0);
    expect(screen.queryByText('AIRTABLE_TECHNICAL_STATUS')).not.toBeInTheDocument();
  });

  it('stores filters in the URL', async () => {
    mockApi();
    const interaction = userEvent.setup();
    renderPages('/app/repairs');
    await screen.findByText('N-2026-0142');
    await interaction.type(screen.getByRole('searchbox'), '0142');
    await interaction.selectOptions(screen.getByLabelText('Stan'), 'all');
    await waitFor(() => {
      expect(screen.getByTestId('location')).toHaveTextContent('search=0142');
      expect(screen.getByTestId('location')).toHaveTextContent('state=all');
    });
  });

  it('opens details, shows history and preserves list filters on return', async () => {
    mockApi();
    const interaction = userEvent.setup();
    renderPages('/app/repairs?search=0142&page=2');
    const row = (await screen.findByText('N-2026-0142')).closest('tr')!;
    await interaction.click(row);
    expect(await screen.findByRole('heading', { name: 'Historia statusów' })).toBeVisible();
    expect(screen.getAllByText('W trakcie naprawy').length).toBeGreaterThan(0);
    await interaction.click(screen.getByRole('button', { name: /Wróć do napraw/ }));
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/app/repairs?search=0142&page=2'));
  });

  it('includes activeHospitalId in the repair query key', () => {
    const first = repairsQueryOptions('hospital-a', { page: 1, pageSize: 25 });
    const second = repairsQueryOptions('hospital-b', { page: 1, pageSize: 25 });
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
          <Route path="/app/repairs" element={<><RepairsPage /><Location /></>} />
          <Route path="/app/repairs/:id" element={<><RepairDetailsPage /><Location /></>} />
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
  vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith('/me')) return json(currentUser);
    if (url.endsWith('/departments')) return json({ items: [{ id: 'department-id', name: 'SOR' }] });
    if (url.includes(`/repairs/${repairId}`)) {
      return json({
        ...repair,
        acceptedAt: null,
        startedAt: null,
        completedAt: null,
        customerDescription: 'Urządzenie zostało przyjęte do serwisu.',
        device: {
          ...repair.device,
          manufacturer: 'Fisher & Paykel',
          model: 'Airvo 3',
          department: repair.department,
          hospital: { id: hospitalId, name: 'Szpital Miejski' },
        },
        statusHistory: [{ id: 'history-id', statusCode: 'IN_PROGRESS', label: 'W trakcie naprawy', changedAt: '2026-07-20T08:00:00Z' }],
        documents: [],
      });
    }
    if (url.includes('/repairs?')) return json({ items: [repair], page: 1, pageSize: 25, totalCount: 1 });
    throw new Error(`Unexpected request: ${url}`);
  }));
}

function json(body: unknown): Promise<Response> {
  return Promise.resolve({ ok: true, status: 200, json: async () => body } as Response);
}
