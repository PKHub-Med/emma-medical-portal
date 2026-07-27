import {
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import type {
  AdminHospital,
  AdminHospitalsResponse,
  AdminUser,
  AdminUsersResponse,
  CurrentUser,
} from '../api';

const admin: CurrentUser = {
  id: '5a9789a5-8899-49f0-86cf-456a703a64a1',
  email: 'admin@example.com',
  status: 'ACTIVE',
  systemRole: 'EMMA_ADMIN',
  memberships: [],
};

const firstHospital: AdminHospital = {
  id: '348f0785-8427-4d33-97ee-61cae8e91e42',
  name: 'Szpital Testowy',
  active: true,
  portalEnabled: true,
  departmentsCount: 0,
  membershipsCount: 1,
  createdAt: '2026-07-27T12:00:00.000Z',
  updatedAt: '2026-07-27T12:00:00.000Z',
};

const secondHospital: AdminHospital = {
  ...firstHospital,
  id: '0ea8b102-bb01-42da-8900-cc19586e9e68',
  name: 'Drugi Szpital',
};

const managedUser: AdminUser = {
  id: '7c6e2bde-0c72-4d84-a967-1e74ed79b439',
  email: 'user@example.com',
  status: 'ACTIVE',
  systemRole: 'USER',
  lastLoginAt: null,
  createdAt: '2026-07-27T12:00:00.000Z',
  memberships: [
    {
      id: '923ddfe7-b71e-4aec-86a5-90478e11ed05',
      hospitalId: firstHospital.id,
      hospitalName: firstHospital.name,
      departmentId: null,
      role: 'HOSPITAL_USER',
    },
    {
      id: '31355456-025c-44ae-b5c0-97945a71db9f',
      hospitalId: secondHospital.id,
      hospitalName: secondHospital.name,
      departmentId: null,
      role: 'HOSPITAL_ADMIN',
    },
  ],
};

describe('Admin users page', () => {
  it('generates a strong 20-character password and can regenerate it', async () => {
    mockUsersApi(() => usersPage([]));
    const user = userEvent.setup();

    renderUsersPage();
    await screen.findByText('Nie znaleziono użytkowników');
    await user.click(
      screen.getByRole('button', { name: 'Dodaj użytkownika' }),
    );
    const dialog = screen.getByRole('dialog');
    const passwordInput = within(dialog).getByLabelText(
      'Hasło tymczasowe',
    ) as HTMLInputElement;
    const firstPassword = passwordInput.value;

    expect(firstPassword).toHaveLength(20);
    expect(firstPassword).toMatch(/[a-z]/);
    expect(firstPassword).toMatch(/[A-Z]/);
    expect(firstPassword).toMatch(/[0-9]/);
    expect(firstPassword).toMatch(/[^a-zA-Z0-9]/);

    await user.click(
      within(dialog).getByRole('button', {
        name: 'Wygeneruj nowe hasło',
      }),
    );
    expect(passwordInput.value).toHaveLength(20);
    expect(passwordInput.value).not.toBe(firstPassword);
  });

  it('copies the generated password and shows confirmation', async () => {
    mockUsersApi(() => usersPage([]));
    const writeText = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });

    renderUsersPage();
    await screen.findByText('Nie znaleziono użytkowników');
    await user.click(
      screen.getByRole('button', { name: 'Dodaj użytkownika' }),
    );
    const dialog = screen.getByRole('dialog');
    const passwordInput = within(dialog).getByLabelText(
      'Hasło tymczasowe',
    ) as HTMLInputElement;
    await user.click(
      within(dialog).getByRole('button', {
        name: 'Kopiuj hasło',
      }),
    );

    expect(writeText).toHaveBeenCalledWith(passwordInput.value);
    expect(
      await within(dialog).findByText(
        'Hasło skopiowano do schowka.',
      ),
    ).toBeVisible();
  });

  it('shows statuses and all hospital memberships', async () => {
    mockUsersApi(() => usersPage([managedUser]));

    renderUsersPage();

    expect(await screen.findByText('user@example.com')).toBeVisible();
    expect(screen.getByText('Aktywny')).toBeVisible();
    expect(screen.getAllByText('Szpital Testowy').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Drugi Szpital').length).toBeGreaterThan(0);
    expect(screen.getByText('Użytkownik szpitala')).toBeVisible();
    expect(screen.getByText('Administrator szpitala')).toBeVisible();
    expect(screen.getByText('Nigdy')).toBeVisible();
  });

  it('creates a normalized user and refreshes the list', async () => {
    let listRequests = 0;
    const fetchMock = mockUsersApi(
      () => {
        listRequests += 1;
        return listRequests === 1
          ? usersPage([])
          : usersPage([managedUser]);
      },
      {
        create: () => managedUser,
      },
    );
    const user = userEvent.setup();

    renderUsersPage();
    await screen.findByText('Nie znaleziono użytkowników');
    await user.click(
      screen.getByRole('button', { name: 'Dodaj użytkownika' }),
    );
    const dialog = screen.getByRole('dialog');
    expect(
      within(dialog).getByText(
        /Hasło jest tymczasowe i należy przekazać/,
      ),
    ).toBeVisible();
    await user.type(
      within(dialog).getByLabelText('Adres e-mail'),
      ' USER@Example.COM ',
    );
    const passwordInput = within(dialog).getByLabelText(
      'Hasło tymczasowe',
    );
    await user.clear(passwordInput);
    await user.type(passwordInput, 'temporary-password');
    await user.selectOptions(
      within(dialog).getByLabelText('Szpital'),
      firstHospital.id,
    );
    await user.selectOptions(
      within(dialog).getByLabelText('Rola w szpitalu'),
      'HOSPITAL_USER',
    );
    await user.click(
      within(dialog).getByRole('button', {
        name: 'Dodaj użytkownika',
      }),
    );

    expect(await screen.findByText('user@example.com')).toBeVisible();
    const createCall = fetchMock.mock.calls.find(
      ([url, init]) =>
        String(url).endsWith('/admin/users') &&
        init?.method === 'POST',
    );
    expect(createCall?.[1]?.body).toBe(
      JSON.stringify({
        email: 'user@example.com',
        temporaryPassword: 'temporary-password',
        hospitalId: firstHospital.id,
        membershipRole: 'HOSPITAL_USER',
      }),
    );
    expect(listRequests).toBe(2);
  });

  it('requires confirmation before blocking and refreshes status', async () => {
    let blocked = false;
    const confirmMock = vi.fn(() => true);
    vi.stubGlobal('confirm', confirmMock);
    const fetchMock = mockUsersApi(
      () =>
        usersPage([
          blocked ? { ...managedUser, status: 'BLOCKED' } : managedUser,
        ]),
      {
        status: () => {
          blocked = true;
          return { ...managedUser, status: 'BLOCKED' };
        },
      },
    );
    const user = userEvent.setup();

    renderUsersPage();
    await screen.findByText('user@example.com');
    await user.click(screen.getByRole('button', { name: 'Zablokuj' }));

    expect(confirmMock).toHaveBeenCalledOnce();
    expect(await screen.findByText('Zablokowany')).toBeVisible();
    const statusCall = fetchMock.mock.calls.find(
      ([url, init]) =>
        String(url).endsWith(`/admin/users/${managedUser.id}/status`) &&
        init?.method === 'PATCH',
    );
    expect(statusCall?.[1]?.body).toBe(
      JSON.stringify({ status: 'BLOCKED' }),
    );
  });

  it('adds access to another hospital', async () => {
    let withMembership = false;
    const userWithoutAccess = { ...managedUser, memberships: [] };
    const fetchMock = mockUsersApi(
      () =>
        usersPage([
          withMembership
            ? { ...userWithoutAccess, memberships: [managedUser.memberships[0]] }
            : userWithoutAccess,
        ]),
      {
        membership: () => {
          withMembership = true;
          return managedUser.memberships[0];
        },
      },
    );
    const user = userEvent.setup();

    renderUsersPage();
    await screen.findByText('Brak dostępu');
    await user.click(
      screen.getByRole('button', {
        name: /Dodaj dostęp do szpitala/,
      }),
    );
    const dialog = screen.getByRole('dialog');
    await user.selectOptions(
      within(dialog).getByLabelText('Szpital'),
      firstHospital.id,
    );
    await user.click(
      within(dialog).getByRole('button', { name: 'Dodaj dostęp' }),
    );

    expect(
      (await screen.findAllByText('Szpital Testowy')).length,
    ).toBeGreaterThan(0);
    const membershipCall = fetchMock.mock.calls.find(
      ([url, init]) =>
        String(url).endsWith(
          `/admin/users/${managedUser.id}/memberships`,
        ) && init?.method === 'POST',
    );
    expect(membershipCall?.[1]?.body).toBe(
      JSON.stringify({
        hospitalId: firstHospital.id,
        role: 'HOSPITAL_USER',
      }),
    );
  });

  it('confirms and removes only the selected access', async () => {
    let removed = false;
    vi.stubGlobal('confirm', vi.fn(() => true));
    const fetchMock = mockUsersApi(
      () =>
        usersPage([
          removed ? { ...managedUser, memberships: [] } : managedUser,
        ]),
      {
        removeMembership: () => {
          removed = true;
        },
      },
    );
    const user = userEvent.setup();

    renderUsersPage();
    await screen.findAllByText('Szpital Testowy');
    await user.click(
      screen.getAllByRole('button', { name: 'Usuń dostęp' })[0],
    );

    expect(await screen.findByText('Brak dostępu')).toBeVisible();
    expect(
      fetchMock.mock.calls.some(
        ([url, init]) =>
          String(url).endsWith(
            `/admin/users/${managedUser.id}/memberships/${managedUser.memberships[0].id}`,
          ) && init?.method === 'DELETE',
      ),
    ).toBe(true);
  });

  it('shows a readable empty and API error state', async () => {
    const fetchMock = mockUsersApi(() => usersPage([]));
    const view = renderUsersPage();

    expect(
      await screen.findByText('Nie znaleziono użytkowników'),
    ).toBeVisible();
    view.unmount();

    fetchMock.mockImplementation(
      (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith('/me')) {
          return jsonResponse(admin);
        }
        if (url.includes('/admin/hospitals?')) {
          return jsonResponse(hospitalsPage());
        }
        return jsonResponse({ technical: 'database secret' }, 500);
      },
    );
    renderUsersPage();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Nie udało się pobrać listy użytkowników.',
    );
    expect(screen.queryByText('database secret')).not.toBeInTheDocument();
  });
});

function renderUsersPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/admin/users']}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function mockUsersApi(
  list: () => AdminUsersResponse,
  mutations: {
    create?: () => AdminUser;
    status?: () => AdminUser;
    membership?: () => AdminUser['memberships'][number];
    removeMembership?: () => void;
  } = {},
) {
  return mockFetch((url, init) => {
    if (url.endsWith('/me')) {
      return jsonResponse(admin);
    }
    if (url.includes('/admin/hospitals?')) {
      return jsonResponse(hospitalsPage());
    }
    if (
      url.endsWith('/admin/users') &&
      init?.method === 'POST' &&
      mutations.create
    ) {
      return jsonResponse(mutations.create());
    }
    if (
      url.endsWith('/status') &&
      init?.method === 'PATCH' &&
      mutations.status
    ) {
      return jsonResponse(mutations.status());
    }
    if (
      /\/admin\/users\/[^/]+\/memberships$/.test(url) &&
      init?.method === 'POST' &&
      mutations.membership
    ) {
      return jsonResponse(mutations.membership());
    }
    if (
      /\/admin\/users\/[^/]+\/memberships\/[^/]+$/.test(url) &&
      init?.method === 'DELETE' &&
      mutations.removeMembership
    ) {
      mutations.removeMembership();
      return emptyResponse();
    }
    if (url.includes('/admin/users?')) {
      return jsonResponse(list());
    }

    throw new Error(`Unexpected request: ${url}`);
  });
}

function usersPage(items: AdminUser[]): AdminUsersResponse {
  return {
    items,
    page: 1,
    pageSize: 25,
    totalCount: items.length,
  };
}

function hospitalsPage(): AdminHospitalsResponse {
  return {
    items: [firstHospital, secondHospital],
    page: 1,
    pageSize: 100,
    totalCount: 2,
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

function emptyResponse(): Promise<Response> {
  return Promise.resolve({
    ok: true,
    status: 204,
  } as Response);
}
