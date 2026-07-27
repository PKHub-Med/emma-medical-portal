import {
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query';
import {
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import type { CurrentUser } from '../api';

const adminUser: CurrentUser = {
  id: 'admin-id',
  email: 'admin@example.com',
  status: 'ACTIVE',
  systemRole: 'EMMA_ADMIN',
  memberships: [],
};

const hospitalUser: CurrentUser = {
  id: 'user-id',
  email: 'user@example.com',
  status: 'ACTIVE',
  systemRole: 'USER',
  memberships: [
    {
      hospitalId: 'hospital-id',
      hospitalName: 'Szpital Miejski',
      departmentId: null,
      role: 'HOSPITAL_USER',
    },
  ],
};

const userWithoutMembership: CurrentUser = {
  ...hospitalUser,
  memberships: [],
};

describe('Emma web authentication and navigation', () => {
  it('redirects EMMA_ADMIN to /admin after login', async () => {
    const fetchMock = mockLoginFlow(adminUser);

    await submitLogin();

    expect(
      await screen.findByRole('heading', {
        name: 'Panel administracyjny Emma',
      }),
    ).toBeVisible();
    expect(
      screen.getByRole('link', { name: /Podsumowanie/ }),
    ).toHaveAttribute('href', '/admin');
    expectLoginRequest(fetchMock);
  });

  it('redirects USER with a membership to /app after login', async () => {
    mockLoginFlow(hospitalUser);

    await submitLogin();

    expect(
      await screen.findByRole('heading', { name: 'Dzień dobry' }),
    ).toBeVisible();
    expect(screen.getAllByText('Szpital Miejski').length).toBeGreaterThan(0);
  });

  it('shows no-access screen to USER without a membership', async () => {
    mockLoginFlow(userWithoutMembership);

    await submitLogin();

    expect(
      await screen.findByRole('heading', {
        name: 'Brak przypisanego dostępu do szpitala.',
      }),
    ).toBeVisible();
  });

  it('does not allow USER to enter /admin', async () => {
    mockAuthenticatedUser(hospitalUser);

    renderApp('/admin');

    expect(
      await screen.findByRole('heading', { name: 'Dzień dobry' }),
    ).toBeVisible();
    expect(
      screen.queryByRole('heading', {
        name: 'Panel administracyjny Emma',
      }),
    ).not.toBeInTheDocument();
  });

  it('redirects an unauthenticated user to /login', async () => {
    const fetchMock = mockFetch(() => unauthorizedResponse());

    renderApp('/app/devices');

    expect(
      await screen.findByRole('heading', { name: 'Zaloguj się' }),
    ).toBeVisible();
    expectAllRequestsIncludeCredentials(fetchMock);
  });

  it('marks the active menu item with text and aria-current', async () => {
    mockAuthenticatedUser(hospitalUser);

    renderApp('/app/devices');

    await screen.findByRole('heading', { name: 'Urządzenia' });
    const activeLinks = screen.getAllByRole('link', {
      name: /Urządzenia.*Bieżąca strona/,
    });

    expect(activeLinks.length).toBeGreaterThan(0);
    for (const link of activeLinks) {
      expect(link).toHaveAttribute('aria-current', 'page');
      expect(link).toHaveClass('active');
    }
  });

  it('clears the whole query cache and redirects after logout', async () => {
    let loggedOut = false;
    const fetchMock = mockFetch((url, init) => {
      if (url.endsWith('/auth/logout') && init?.method === 'POST') {
        loggedOut = true;
        return emptyResponse();
      }

      if (url.endsWith('/me')) {
        return loggedOut
          ? unauthorizedResponse()
          : jsonResponse(hospitalUser);
      }

      throw new Error(`Unexpected request: ${url}`);
    });
    const { queryClient } = renderApp('/app');
    const clearSpy = vi.spyOn(queryClient, 'clear');
    const user = userEvent.setup();

    await screen.findByRole('heading', { name: 'Dzień dobry' });
    await user.click(
      screen.getByRole('button', { name: /Wyloguj się/ }),
    );

    expect(clearSpy).toHaveBeenCalledOnce();
    expect(
      await screen.findByRole('heading', { name: 'Zaloguj się' }),
    ).toBeVisible();
    expect(
      fetchMock.mock.calls.some(
        ([url, init]) =>
          String(url).endsWith('/auth/logout') &&
          init?.method === 'POST',
      ),
    ).toBe(true);
  });

  it('does not request /me again while changing portal pages', async () => {
    const fetchMock = mockAuthenticatedUser(hospitalUser);
    const user = userEvent.setup();

    renderApp('/app');
    await screen.findByRole('heading', { name: 'Dzień dobry' });
    await user.click(
      screen.getAllByRole('link', { name: /Urządzenia/ })[0],
    );
    await screen.findByRole('heading', { name: 'Urządzenia' });

    expect(
      fetchMock.mock.calls.filter(([url]) =>
        String(url).endsWith('/me'),
      ),
    ).toHaveLength(1);
  });

  it('validates the login form before sending credentials', async () => {
    const fetchMock = mockFetch(() => unauthorizedResponse());
    const user = userEvent.setup();

    renderApp('/login');
    await screen.findByRole('heading', { name: 'Zaloguj się' });
    await user.click(
      screen.getByRole('button', { name: 'Zaloguj się' }),
    );

    expect(
      await screen.findByText('Adres e-mail jest wymagany.'),
    ).toBeVisible();
    expect(screen.getByText('Hasło jest wymagane.')).toBeVisible();
    expect(
      fetchMock.mock.calls.filter(
        ([, init]) => init?.method === 'POST',
      ),
    ).toHaveLength(0);
  });

  it('shows a generic message after failed login', async () => {
    mockFetch((url, init) => {
      if (url.endsWith('/me')) {
        return unauthorizedResponse();
      }

      if (url.endsWith('/auth/login') && init?.method === 'POST') {
        return unauthorizedResponse();
      }

      throw new Error(`Unexpected request: ${url}`);
    });
    const user = userEvent.setup();

    renderApp('/login');
    await screen.findByRole('heading', { name: 'Zaloguj się' });
    await user.type(
      screen.getByLabelText('Adres e-mail'),
      'admin@example.com',
    );
    await user.type(screen.getByLabelText('Hasło'), 'wrong-password');
    await user.click(
      screen.getByRole('button', { name: 'Zaloguj się' }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Nieprawidłowy e-mail lub hasło.',
    );
  });
});

async function submitLogin() {
  const user = userEvent.setup();

  renderApp('/login');
  await screen.findByRole('heading', { name: 'Zaloguj się' });
  await user.type(
    screen.getByLabelText('Adres e-mail'),
    'admin@example.com',
  );
  await user.type(screen.getByLabelText('Hasło'), 'safe-password');
  await user.click(
    screen.getByRole('button', { name: 'Zaloguj się' }),
  );
}

function renderApp(initialEntry: string) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
      mutations: {
        retry: false,
      },
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

function mockLoginFlow(user: CurrentUser) {
  let meRequests = 0;

  return mockFetch((url, init) => {
    if (url.endsWith('/auth/login') && init?.method === 'POST') {
      return jsonResponse({ status: 'ok' });
    }

    if (url.endsWith('/me')) {
      meRequests += 1;
      return meRequests === 1
        ? unauthorizedResponse()
        : jsonResponse(user);
    }

    throw new Error(`Unexpected request: ${url}`);
  });
}

function mockAuthenticatedUser(user: CurrentUser) {
  return mockFetch((url) => {
    if (url.endsWith('/me')) {
      return jsonResponse(user);
    }

    throw new Error(`Unexpected request: ${url}`);
  });
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

function unauthorizedResponse(): Promise<Response> {
  return jsonResponse(
    { message: 'Nieprawidłowy e-mail lub hasło.' },
    401,
  );
}

function emptyResponse(): Promise<Response> {
  return Promise.resolve({
    ok: true,
    status: 204,
  } as Response);
}

function expectLoginRequest(
  fetchMock: ReturnType<typeof vi.fn>,
) {
  const loginCall = fetchMock.mock.calls.find(
    ([url]) => String(url).endsWith('/auth/login'),
  );

  expect(loginCall?.[1]).toMatchObject({
    method: 'POST',
    credentials: 'include',
    body: JSON.stringify({
      email: 'admin@example.com',
      password: 'safe-password',
    }),
  });
}

function expectAllRequestsIncludeCredentials(
  fetchMock: ReturnType<typeof vi.fn>,
) {
  for (const [, init] of fetchMock.mock.calls) {
    expect(init).toEqual(
      expect.objectContaining({
        credentials: 'include',
      }),
    );
  }
}
