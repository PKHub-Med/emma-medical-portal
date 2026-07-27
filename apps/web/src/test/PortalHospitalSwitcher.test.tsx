import {
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import type {
  CurrentUser,
  PortalHospital,
  PortalHospitalsResponse,
} from '../api';
import { hospitalScopedQueryKey } from '../query';

const firstHospital: PortalHospital = {
  id: '348f0785-8427-4d33-97ee-61cae8e91e42',
  name: 'Szpital Miejski',
  role: 'HOSPITAL_USER',
};

const secondHospital: PortalHospital = {
  id: '0ea8b102-bb01-42da-8900-cc19586e9e68',
  name: 'Szpital Specjalistyczny',
  role: 'HOSPITAL_ADMIN',
};

const portalUser: CurrentUser = {
  id: '7c6e2bde-0c72-4d84-a967-1e74ed79b439',
  email: 'user@example.com',
  status: 'ACTIVE',
  systemRole: 'USER',
  memberships: [
    {
      hospitalId: firstHospital.id,
      hospitalName: firstHospital.name,
      departmentId: null,
      role: firstHospital.role,
    },
    {
      hospitalId: secondHospital.id,
      hospitalName: secondHospital.name,
      departmentId: null,
      role: secondHospital.role,
    },
  ],
  activeHospital: firstHospital,
};

describe('Portal hospital switcher', () => {
  it('switches hospital, clears scoped cache and navigates to /app', async () => {
    let switched = false;
    const fetchMock = mockFetch((url, init) => {
      if (url.endsWith('/me') && !init?.method) {
        return jsonResponse({
          ...portalUser,
          activeHospital: switched ? secondHospital : firstHospital,
        });
      }
      if (url.endsWith('/hospitals')) {
        return jsonResponse({
          items: [firstHospital, secondHospital],
          activeHospitalId: switched
            ? secondHospital.id
            : firstHospital.id,
        } satisfies PortalHospitalsResponse);
      }
      if (
        url.endsWith('/me/active-hospital') &&
        init?.method === 'PATCH'
      ) {
        switched = true;
        return jsonResponse(secondHospital);
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    const { queryClient } = renderPortal('/app/devices');
    queryClient.setQueryData(
      [...hospitalScopedQueryKey, 'devices', firstHospital.id],
      { secretScopedData: true },
    );
    const user = userEvent.setup();

    await screen.findByRole('heading', { name: 'Urządzenia' });
    const selector = await screen.findByLabelText('Szpital');
    await user.selectOptions(selector, secondHospital.id);

    expect(
      await screen.findByRole('heading', { name: 'Dzień dobry' }),
    ).toBeVisible();
    expect(
      screen.getAllByText(secondHospital.name).length,
    ).toBeGreaterThan(0);
    expect(
      queryClient.getQueryData([
        ...hospitalScopedQueryKey,
        'devices',
        firstHospital.id,
      ]),
    ).toBeUndefined();
    expect(
      fetchMock.mock.calls.some(
        ([url, init]) =>
          String(url).endsWith('/me/active-hospital') &&
          init?.method === 'PATCH' &&
          init.body ===
            JSON.stringify({ hospitalId: secondHospital.id }),
      ),
    ).toBe(true);
    await waitFor(() => {
      expect(selector).not.toBeDisabled();
    });
  });

  it('does not show the selector for one available hospital', async () => {
    mockFetch((url) => {
      if (url.endsWith('/me')) {
        return jsonResponse({
          ...portalUser,
          memberships: [portalUser.memberships[0]],
          activeHospital: firstHospital,
        });
      }
      if (url.endsWith('/hospitals')) {
        return jsonResponse({
          items: [firstHospital],
          activeHospitalId: firstHospital.id,
        } satisfies PortalHospitalsResponse);
      }
      throw new Error(`Unexpected request: ${url}`);
    });

    renderPortal('/app');

    await screen.findByRole('heading', { name: 'Dzień dobry' });
    await screen.findAllByText(firstHospital.name);
    expect(screen.queryByLabelText('Szpital')).not.toBeInTheDocument();
  });
});

function renderPortal(initialEntry: string) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return {
    queryClient,
    ...render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[initialEntry]}>
          <App />
        </MemoryRouter>
      </QueryClientProvider>,
    ),
  };
}

function mockFetch(
  handler: (url: string, init?: RequestInit) => Promise<Response>,
) {
  const fetchMock = vi.fn(
    (input: RequestInfo | URL, init?: RequestInit) =>
      handler(String(input), init),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function jsonResponse(body: unknown): Promise<Response> {
  return Promise.resolve({
    ok: true,
    status: 200,
    json: async () => body,
  } as Response);
}
