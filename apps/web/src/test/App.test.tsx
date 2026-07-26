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

const currentUser: CurrentUser = {
  id: 'user-id',
  email: 'admin@example.com',
  status: 'ACTIVE',
  systemRole: 'EMMA_ADMIN',
  memberships: [],
};

describe('Emma web authentication', () => {
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

  it('logs in, fetches /me and navigates to /app', async () => {
    let meRequests = 0;
    const fetchMock = mockFetch((url, init) => {
      if (url.endsWith('/auth/login') && init?.method === 'POST') {
        return jsonResponse({ status: 'ok' });
      }

      if (url.endsWith('/me')) {
        meRequests += 1;
        return meRequests === 1
          ? unauthorizedResponse()
          : jsonResponse(currentUser);
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
    await user.type(screen.getByLabelText('Hasło'), 'safe-password');
    await user.click(
      screen.getByRole('button', { name: 'Zaloguj się' }),
    );

    expect(
      await screen.findByText('Zalogowano jako:'),
    ).toBeVisible();
    expect(screen.getByText('admin@example.com')).toBeVisible();
    expect(screen.getByText('EMMA_ADMIN')).toBeVisible();

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
    expect(meRequests).toBe(2);
    expectAllRequestsIncludeCredentials(fetchMock);
  });

  it('shows the generic message after failed login', async () => {
    const fetchMock = mockFetch((url, init) => {
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

    expect(
      await screen.findByRole('alert'),
    ).toHaveTextContent('Nieprawidłowy e-mail lub hasło.');
    expectAllRequestsIncludeCredentials(fetchMock);
  });

  it('redirects an unauthenticated user from /app to /login', async () => {
    const fetchMock = mockFetch(() => unauthorizedResponse());

    renderApp('/app');

    expect(
      await screen.findByRole('heading', { name: 'Zaloguj się' }),
    ).toBeVisible();
    expectAllRequestsIncludeCredentials(fetchMock);
  });

  it('logs out, clears the user cache and redirects to /login', async () => {
    let loggedOut = false;
    const fetchMock = mockFetch((url, init) => {
      if (url.endsWith('/auth/logout') && init?.method === 'POST') {
        loggedOut = true;
        return emptyResponse();
      }

      if (url.endsWith('/me')) {
        return loggedOut
          ? unauthorizedResponse()
          : jsonResponse(currentUser);
      }

      throw new Error(`Unexpected request: ${url}`);
    });
    const user = userEvent.setup();

    renderApp('/app');
    await screen.findByText('admin@example.com');
    await user.click(
      screen.getByRole('button', { name: 'Wyloguj się' }),
    );

    expect(
      await screen.findByRole('heading', { name: 'Zaloguj się' }),
    ).toBeVisible();
    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(
          ([url, init]) =>
            String(url).endsWith('/auth/logout') &&
            init?.method === 'POST',
        ),
      ).toBe(true);
    });
    expectAllRequestsIncludeCredentials(fetchMock);
  });
});

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

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  );
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
