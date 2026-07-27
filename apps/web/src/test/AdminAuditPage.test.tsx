import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AuditEvent } from '../api';
import { AdminAuditPage } from '../pages/AdminAuditPage';

const event: AuditEvent = {
  id: 'audit-id',
  action: 'AUTH_LOGIN_FAILED',
  outcome: 'FAILURE',
  actor: null,
  entityType: 'USER',
  entityId: '7c6e2bde-0c72-4d84-a967-1e74ed79b439',
  hospital: { id: 'hospital-id', name: 'Szpital Testowy' },
  metadata: {
    email: 'p***@example.com',
    changedFields: ['status'],
  },
  ipAddress: '127.0.0.1',
  userAgent: 'Test Browser',
  requestId: 'req-123',
  createdAt: '2026-07-27T12:00:00.000Z',
};

afterEach(() => vi.restoreAllMocks());

describe('Admin audit page', () => {
  it('renders events, translated names and FAILURE text', async () => {
    mockApi([event]);
    renderPage();

    expect(
      await screen.findByRole('cell', { name: 'Nieudane logowanie' }),
    ).toBeVisible();
    expect(
      screen.getByRole('cell', { name: 'Niepowodzenie' }),
    ).toBeVisible();
    expect(
      screen.getByRole('cell', { name: 'Szpital Testowy' }),
    ).toBeVisible();
  });

  it('changes request parameters when filters change', async () => {
    const fetchMock = mockApi([event]);
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole('cell', { name: 'Nieudane logowanie' });

    await user.selectOptions(
      screen.getByLabelText('Rezultat'),
      'SUCCESS',
    );

    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(([url]) =>
          String(url).includes('outcome=SUCCESS'),
        ),
      ).toBe(true),
    );
  });

  it('opens a formatted details modal', async () => {
    mockApi([event]);
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole('cell', { name: 'Nieudane logowanie' });
    await user.click(screen.getByRole('button', { name: 'Szczegóły' }));

    expect(
      screen.getByRole('dialog', { name: 'Szczegóły zdarzenia' }),
    ).toBeVisible();
    expect(screen.getByText('req-123')).toBeVisible();
    expect(screen.getByText('p***@example.com')).toBeVisible();
    expect(screen.queryByText(/^\{/)).not.toBeInTheDocument();
  });

  it('shows the empty state and clear-filters action', async () => {
    mockApi([]);
    renderPage();

    expect(
      await screen.findByText('Brak zdarzeń dla wybranych filtrów'),
    ).toBeVisible();
    expect(
      screen.getAllByRole('button', { name: 'Wyczyść filtry' }),
    ).not.toHaveLength(0);
  });
});

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/admin/audit']}>
        <AdminAuditPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function mockApi(items: AuditEvent[]) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/admin/audit?')) {
      return jsonResponse({
        items,
        page: 1,
        pageSize: 25,
        totalCount: items.length,
      });
    }
    if (url.includes('/admin/hospitals?')) {
      return jsonResponse({
        items: [
          {
            id: 'hospital-id',
            name: 'Szpital Testowy',
            active: true,
            portalEnabled: true,
            departmentsCount: 0,
            membershipsCount: 0,
            createdAt: event.createdAt,
            updatedAt: event.createdAt,
          },
        ],
        page: 1,
        pageSize: 100,
        totalCount: 1,
      });
    }
    return jsonResponse({}, 404);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}
