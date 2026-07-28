import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { StatusMapping, StatusMappingsResponse } from '../api';
import { AdminStatusesPage } from '../pages/AdminStatusesPage';

const mapping: StatusMapping = {
  id: '348f0785-8427-4d33-97ee-61cae8e91e42',
  sourceEntityType: 'REPAIR',
  sourceStatus: 'IN_PROGRESS',
  customerStatusCode: 'IN_PROGRESS',
  customerLabel: 'W trakcie naprawy',
  emailTemplateId: null,
  sendEmail: false,
  isTerminal: false,
  requiresAction: false,
  active: true,
  createdAt: '2026-07-28T12:00:00.000Z',
  updatedAt: '2026-07-28T12:00:00.000Z',
};

describe('Admin status mappings page', () => {
  it('renders mappings with readable technical labels', async () => {
    mockApi(() => page([mapping]));
    renderPage();

    expect(await screen.findByText('W trakcie naprawy')).toBeVisible();
    expect(screen.getByRole('cell', { name: 'Naprawa' })).toBeVisible();
    expect(screen.getByText('Bez e-maila')).toBeVisible();
    expect(screen.getByText('Status otwarty')).toBeVisible();
    expect(screen.getByRole('cell', { name: 'Aktywne' })).toBeVisible();
  });

  it('creates a mapping and refreshes the table', async () => {
    let requests = 0;
    const fetchMock = mockApi(
      () => page(requests++ ? [mapping] : []),
      () => mapping,
    );
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Nie dodano jeszcze mapowań statusów.');
    await user.click(screen.getByRole('button', { name: 'Dodaj mapowanie' }));
    await user.type(screen.getByLabelText('Status źródłowy'), 'IN_PROGRESS');
    await user.type(screen.getByLabelText('Kod statusu klienta'), 'in_progress');
    await user.type(screen.getByLabelText('Etykieta dla klienta'), 'W trakcie naprawy');
    await user.click(screen.getByRole('button', { name: 'Dodaj' }));

    expect(await screen.findByText('W trakcie naprawy')).toBeVisible();
    const call = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST');
    expect(JSON.parse(String(call?.[1]?.body))).toMatchObject({
      customerStatusCode: 'IN_PROGRESS',
      sourceEntityType: 'REPAIR',
    });
  });

  it('edits and deactivates a mapping', async () => {
    const fetchMock = mockApi(() => page([mapping]), () => ({ ...mapping, active: false }));
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('W trakcie naprawy');
    await user.click(screen.getByRole('button', { name: 'Edytuj' }));
    expect(screen.getByLabelText('Typ encji')).toBeDisabled();
    await user.clear(screen.getByLabelText('Etykieta dla klienta'));
    await user.type(screen.getByLabelText('Etykieta dla klienta'), 'Naprawa trwa');
    await user.click(screen.getByRole('button', { name: 'Zapisz' }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'PATCH')).toBe(true));

    await user.click(screen.getByRole('button', { name: 'Dezaktywuj' }));
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'PATCH')).toHaveLength(2);
  });

  it('shows a non-blocking warning for e-mail without a template', async () => {
    mockApi(() => page([]), () => mapping);
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Nie dodano jeszcze mapowań statusów.');
    await user.click(screen.getByRole('button', { name: 'Dodaj mapowanie' }));
    await user.click(screen.getByLabelText('Wyślij e-mail'));

    expect(screen.getByRole('status')).toHaveTextContent(
      'Wysyłka jest włączona, ale nie wskazano szablonu.',
    );
    expect(screen.getByRole('button', { name: 'Dodaj' })).toBeEnabled();
  });

  it('renders the empty state', async () => {
    mockApi(() => page([]));
    renderPage();
    expect(await screen.findByText('Nie dodano jeszcze mapowań statusów.')).toBeVisible();
  });
});

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <AdminStatusesPage />
    </QueryClientProvider>,
  );
}

function mockApi(
  list: () => StatusMappingsResponse,
  mutate?: () => StatusMapping,
) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes('/admin/statuses?')) return response(list());
    if (url.includes('/admin/statuses') && mutate && (init?.method === 'POST' || init?.method === 'PATCH')) {
      return response(mutate());
    }
    return response({}, 404);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function page(items: StatusMapping[]): StatusMappingsResponse {
  return { items, page: 1, pageSize: 25, totalCount: items.length };
}

function response(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}
