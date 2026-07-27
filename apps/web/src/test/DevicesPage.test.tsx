import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DeviceDetailsPage } from '../pages/DeviceDetailsPage';
import { DevicesPage } from '../pages/DevicesPage';
import { devicesQueryOptions } from '../query';

const hospitalId = '348f0785-8427-4d33-97ee-61cae8e91e42';
const deviceId = '93027cb0-b139-4ed0-8328-a00328368d8a';
const user = {
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
const listResponse = {
  items: [
    {
      id: deviceId,
      name: 'Respirator Airvo 3',
      manufacturer: 'Fisher & Paykel',
      model: 'Airvo 3',
      serialNo: 'A3-9921',
      inventoryNo: 'INV-3317',
      category: 'Respiratory',
      department: null,
      active: true,
    },
  ],
  page: 1,
  pageSize: 25,
  totalCount: 1,
};

afterEach(() => vi.unstubAllGlobals());

describe('Portal devices UI', () => {
  it('shows devices and the unassigned department label', async () => {
    mockApi();
    renderPages('/app/devices');
    expect(await screen.findByText('Respirator Airvo 3')).toBeVisible();
    expect(screen.getByText('Oddział nieprzypisany')).toBeVisible();
  });

  it('stores search and department filters in the URL', async () => {
    mockApi();
    const interaction = userEvent.setup();
    renderPages('/app/devices');
    await screen.findByText('Respirator Airvo 3');
    await interaction.type(screen.getByRole('searchbox'), 'Airvo');
    await interaction.selectOptions(
      screen.getByLabelText('Oddział'),
      'fa983def-0fc0-4d10-b735-96d7a69bf440',
    );
    await waitFor(() => {
      expect(screen.getByTestId('location')).toHaveTextContent(
        'search=Airvo',
      );
      expect(screen.getByTestId('location')).toHaveTextContent(
        'departmentId=fa983def-0fc0-4d10-b735-96d7a69bf440',
      );
    });
  });

  it('opens details by clicking a row and keeps filters on return', async () => {
    mockApi();
    const interaction = userEvent.setup();
    renderPages('/app/devices?search=Airvo&page=2');
    const row = (await screen.findByText('Respirator Airvo 3')).closest('tr')!;
    await interaction.click(row);
    expect(await screen.findByRole('heading', { name: 'Respirator Airvo 3' }))
      .toBeVisible();
    await interaction.click(screen.getByRole('button', { name: /Wróć do urządzeń/ }));
    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent(
        '/app/devices?search=Airvo&page=2',
      ),
    );
  });

  it('shows all empty detail sections', async () => {
    mockApi();
    renderPages(`/app/devices/${deviceId}`);
    expect(
      await screen.findByText('Brak napraw przypisanych do urządzenia.'),
    ).toBeVisible();
    expect(screen.getByText('Brak przeglądów przypisanych do urządzenia.'))
      .toBeVisible();
    expect(screen.getByText('Brak dokumentów przypisanych do urządzenia.'))
      .toBeVisible();
  });

  it('includes activeHospitalId in the device query key', () => {
    const first = devicesQueryOptions('hospital-a', { page: 1, pageSize: 25 });
    const second = devicesQueryOptions('hospital-b', { page: 1, pageSize: 25 });
    expect(first.queryKey).not.toEqual(second.queryKey);
    expect(first.queryKey).toContain('hospital-a');
    expect(second.queryKey).toContain('hospital-b');
  });
});

function renderPages(entry: string) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route path="/app/devices" element={<><DevicesPage /><Location /></>} />
          <Route path="/app/devices/:id" element={<><DeviceDetailsPage /><Location /></>} />
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
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/me')) return json(user);
      if (url.endsWith('/departments')) {
        return json({
          items: [
            {
              id: 'fa983def-0fc0-4d10-b735-96d7a69bf440',
              name: 'SOR',
            },
          ],
        });
      }
      if (url.includes(`/devices/${deviceId}`)) {
        return json({
          ...listResponse.items[0],
          hospital: { id: hospitalId, name: 'Szpital Miejski' },
          qrEpc: null,
          passportNo: null,
          repairs: [],
          inspections: [],
          documents: [],
        });
      }
      if (url.includes('/devices?')) return json(listResponse);
      throw new Error(`Unexpected request: ${url}`);
    }),
  );
}

function json(body: unknown): Promise<Response> {
  return Promise.resolve({
    ok: true,
    status: 200,
    json: async () => body,
  } as Response);
}
