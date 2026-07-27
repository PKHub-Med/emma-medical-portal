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
  AdminHospital,
  AdminHospitalsResponse,
  CurrentUser,
} from '../api';

const admin: CurrentUser = {
  id: 'admin-id',
  email: 'admin@example.com',
  status: 'ACTIVE',
  systemRole: 'EMMA_ADMIN',
  memberships: [],
};

const hospital: AdminHospital = {
  id: '348f0785-8427-4d33-97ee-61cae8e91e42',
  name: 'Szpital Miejski',
  active: true,
  portalEnabled: false,
  departmentsCount: 2,
  membershipsCount: 5,
  createdAt: '2026-07-27T12:00:00.000Z',
  updatedAt: '2026-07-27T12:00:00.000Z',
};

describe('Admin hospitals page', () => {
  it('renders the hospitals table with textual statuses', async () => {
    mockAdminApi(() => pageWith([hospital]));

    renderHospitalsPage();

    expect(
      await screen.findByRole('heading', { name: 'Szpitale' }),
    ).toBeVisible();
    expect(await screen.findByText('Szpital Miejski')).toBeVisible();
    expect(
      screen.getByRole('columnheader', { name: 'Użytkownicy' }),
    ).toBeVisible();
    expect(screen.getByText('Aktywny')).toBeVisible();
    expect(screen.getByText('Wyłączony')).toBeVisible();
    expect(screen.getByText('2')).toBeVisible();
    expect(screen.getByText('5')).toBeVisible();
  });

  it('creates a hospital and refreshes the list', async () => {
    let listRequests = 0;
    const fetchMock = mockAdminApi(
      () => {
        listRequests += 1;
        return listRequests === 1
          ? pageWith([])
          : pageWith([hospital]);
      },
      {
        create: () => hospital,
      },
    );
    const user = userEvent.setup();

    renderHospitalsPage();
    await screen.findByText('Nie znaleziono szpitali');
    await user.click(
      screen.getByRole('button', { name: 'Dodaj szpital' }),
    );
    await user.type(
      screen.getByLabelText('Nazwa szpitala'),
      '  Szpital Miejski  ',
    );
    await user.click(
      screen.getByRole('button', { name: 'Dodaj' }),
    );

    expect(await screen.findByText('Szpital Miejski')).toBeVisible();
    const createCall = fetchMock.mock.calls.find(
      ([url, init]) =>
        String(url).endsWith('/admin/hospitals') &&
        init?.method === 'POST',
    );
    expect(createCall?.[1]?.body).toBe(
      JSON.stringify({ name: 'Szpital Miejski' }),
    );
    expect(listRequests).toBe(2);
  });

  it('updates hospital availability and refreshes the list', async () => {
    let updated = false;
    const fetchMock = mockAdminApi(
      () =>
        pageWith([
          updated ? { ...hospital, active: false } : hospital,
        ]),
      {
        update: () => {
          updated = true;
          return { ...hospital, active: false };
        },
      },
    );
    const user = userEvent.setup();

    renderHospitalsPage();
    await screen.findByText('Szpital Miejski');
    await user.click(
      screen.getByRole('button', { name: 'Dezaktywuj' }),
    );

    expect(await screen.findByText('Nieaktywny')).toBeVisible();
    const updateCall = fetchMock.mock.calls.find(
      ([url, init]) =>
        String(url).includes(hospital.id) &&
        init?.method === 'PATCH',
    );
    expect(updateCall?.[1]?.body).toBe(
      JSON.stringify({ active: false }),
    );
  });

  it('validates a hospital name before sending it', async () => {
    const fetchMock = mockAdminApi(() => pageWith([]));
    const user = userEvent.setup();

    renderHospitalsPage();
    await screen.findByText('Nie znaleziono szpitali');
    await user.click(
      screen.getByRole('button', { name: 'Dodaj szpital' }),
    );
    await user.type(screen.getByLabelText('Nazwa szpitala'), 'ab');
    await user.click(
      screen.getByRole('button', { name: 'Dodaj' }),
    );

    expect(
      await screen.findByText(
        'Nazwa szpitala musi mieć co najmniej 3 znaki.',
      ),
    ).toBeVisible();
    expect(
      fetchMock.mock.calls.filter(
        ([, init]) => init?.method === 'POST',
      ),
    ).toHaveLength(0);
  });

  it('shows a readable error when the list cannot be loaded', async () => {
    mockFetch((url) => {
      if (url.endsWith('/me')) {
        return jsonResponse(admin);
      }

      if (url.includes('/admin/hospitals?')) {
        return jsonResponse({ message: 'internal details' }, 500);
      }

      throw new Error(`Unexpected request: ${url}`);
    });

    renderHospitalsPage();

    expect(
      await screen.findByRole('alert'),
    ).toHaveTextContent('Nie udało się pobrać listy szpitali.');
    expect(screen.queryByText('internal details')).not.toBeInTheDocument();
  });
});

function renderHospitalsPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/admin/hospitals']}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function mockAdminApi(
  list: (url: string) => AdminHospitalsResponse,
  mutations: {
    create?: () => AdminHospital;
    update?: () => AdminHospital;
  } = {},
) {
  return mockFetch((url, init) => {
    if (url.endsWith('/me')) {
      return jsonResponse(admin);
    }

    if (
      url.endsWith('/admin/hospitals') &&
      init?.method === 'POST' &&
      mutations.create
    ) {
      return jsonResponse(mutations.create());
    }

    if (
      url.includes('/admin/hospitals/') &&
      init?.method === 'PATCH' &&
      mutations.update
    ) {
      return jsonResponse(mutations.update());
    }

    if (url.includes('/admin/hospitals?')) {
      return jsonResponse(list(url));
    }

    throw new Error(`Unexpected request: ${url}`);
  });
}

function pageWith(items: AdminHospital[]): AdminHospitalsResponse {
  return {
    items,
    page: 1,
    pageSize: 25,
    totalCount: items.length,
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

function jsonResponse(
  body: unknown,
  status = 200,
): Promise<Response> {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response);
}
