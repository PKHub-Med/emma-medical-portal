import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PortalDashboardPage } from '../pages/PortalDashboardPage';
import { dashboardQueryOptions } from '../query';

const hospitalId = '348f0785-8427-4d33-97ee-61cae8e91e42';
const currentUser = {
  id: 'user-id',
  email: 'user@example.com',
  status: 'ACTIVE',
  systemRole: 'USER',
  memberships: [],
  activeHospital: {
    id: hospitalId,
    name: 'Szpital Miejski',
    role: 'HOSPITAL_USER',
  },
};
const summary = {
  openRepairs: 12,
  overdueInspections: 2,
  inspectionsNext30Days: 8,
  devices: 146,
  recentStatusChanges: [{
    id: 'history-id',
    entityType: 'REPAIR',
    entityId: 'repair-id',
    businessNumber: 'N-2026-0142',
    deviceName: 'Respirator Airvo 3',
    statusCode: 'IN_PROGRESS',
    label: 'W trakcie naprawy',
    changedAt: '2026-07-28T10:00:00Z',
  }],
  upcomingInspections: [{
    id: 'inspection-id',
    businessNumber: 'P-2026-0081',
    deviceName: 'Nawilżacz MR850',
    departmentName: 'Neonatologia',
    dueAt: '2026-08-10T21:59:59Z',
    daysUntilDue: 13,
  }],
};

afterEach(() => vi.unstubAllGlobals());

describe('Portal dashboard', () => {
  it('shows KPI values fetched only from the dashboard endpoint', async () => {
    const fetchMock = mockApi(summary);
    renderDashboard();

    expect(await screen.findByText('146')).toBeVisible();
    expect(screen.getByText('12')).toBeVisible();
    expect(screen.getByText('2')).toBeVisible();
    expect(screen.getByText('8')).toBeVisible();
    expect(fetchMock.mock.calls.some(([input]) =>
      String(input).endsWith('/dashboard/summary'))).toBe(true);
    expect(fetchMock.mock.calls.some(([input]) =>
      /\/(devices|repairs|inspections)\?/.test(String(input)))).toBe(false);
  });

  it('links every KPI card to its expected list or filter', async () => {
    mockApi(summary);
    renderDashboard();
    await screen.findByText('146');

    expect(screen.getByRole('link', { name: /Otwarte naprawy/ }))
      .toHaveAttribute('href', '/app/repairs?state=open');
    expect(screen.getByRole('link', { name: /Przeglądy po terminie/ }))
      .toHaveAttribute('href', '/app/inspections?due=overdue');
    expect(screen.getByRole('link', { name: /Przeglądy w 30 dni/ }))
      .toHaveAttribute('href', '/app/inspections?due=next30days');
    expect(screen.getByRole('link', { name: /Urządzenia/ }))
      .toHaveAttribute('href', '/app/devices');
  });

  it('shows recent changes and links them to the correct details', async () => {
    mockApi(summary);
    renderDashboard();

    expect(await screen.findByText('W trakcie naprawy')).toBeVisible();
    expect(screen.getByRole('link', { name: /N-2026-0142/ }))
      .toHaveAttribute('href', '/app/repairs/repair-id');
  });

  it('shows upcoming inspections and links them to inspection details', async () => {
    mockApi(summary);
    renderDashboard();

    expect(await screen.findByText('13 dni do terminu')).toBeVisible();
    expect(screen.getByText('Neonatologia')).toBeVisible();
    expect(screen.getByRole('link', { name: /Nawilżacz MR850/ }))
      .toHaveAttribute('href', '/app/inspections/inspection-id');
  });

  it('shows both empty states', async () => {
    mockApi({
      ...summary,
      recentStatusChanges: [],
      upcomingInspections: [],
    });
    renderDashboard();

    expect(await screen.findByText('Brak ostatnich zmian statusów.'))
      .toBeVisible();
    expect(screen.getByText('Brak nadchodzących przeglądów.')).toBeVisible();
  });

  it('shows a skeleton while the dashboard request is pending', async () => {
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
      if (String(input).endsWith('/me')) return json(currentUser);
      return new Promise<Response>(() => undefined);
    }));
    renderDashboard();

    expect(await screen.findByRole('status', {
      name: 'Ładowanie podsumowania',
    })).toBeVisible();
  });

  it('includes activeHospitalId in the dashboard query key', () => {
    const first = dashboardQueryOptions('hospital-a');
    const second = dashboardQueryOptions('hospital-b');
    expect(first.queryKey).not.toEqual(second.queryKey);
    expect(first.queryKey).toContain('hospital-a');
    expect(second.queryKey).toContain('hospital-b');
  });
});

function renderDashboard() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/app']}>
        <Routes>
          <Route path="/app" element={<PortalDashboardPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function mockApi(body: typeof summary) {
  const fetchMock = vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith('/me')) return json(currentUser);
    if (url.endsWith('/dashboard/summary')) return json(body);
    throw new Error(`Unexpected request: ${url}`);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function json(body: unknown): Promise<Response> {
  return Promise.resolve({
    ok: true,
    status: 200,
    json: async () => body,
  } as Response);
}
