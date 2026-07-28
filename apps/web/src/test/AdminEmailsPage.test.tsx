import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { NotificationEvent, NotificationEventDetails } from '../api';
import { AdminEmailsPage } from '../pages/AdminEmailsPage';

const blocked: NotificationEvent = {
  id: 'event-1', eventKey: 'repair:r1:status:COMPLETED:v1',
  eventType: 'STATUS_CHANGED', entityType: 'REPAIR', entityId: 'r1',
  businessNumber: 'N-2026-001', customerLabel: 'Zakończona', status: 'BLOCKED',
  blockedReasonCode: 'NO_ACTIVE_RECIPIENT',
  blockedReasonMessage: 'Nie znaleziono aktywnego odbiorcy.',
  hospital: { id: 'hospital-1', name: 'Szpital Testowy' },
  occurredAt: '2026-07-28T12:00:00Z', createdAt: '2026-07-28T12:00:00Z',
  deliveries: [],
};
const ready: NotificationEvent = {
  ...blocked, id: 'event-2', status: 'READY', blockedReasonCode: null,
  blockedReasonMessage: null, customerLabel: 'W trakcie',
  deliveries: [{
    id: 'delivery-1', recipientEmail: 'anna@example.pl', recipientName: 'Anna',
    status: 'QUEUED', attempts: 0, providerId: null, lastErrorMessage: null,
  }],
};
const details: NotificationEventDetails = {
  ...ready, customerStatusCode: 'IN_PROGRESS', emailTemplateId: 'tpl',
  payload: { businessNumber: ready.businessNumber, deviceName: 'USG' },
  communicationSettings: { enabled: true, primaryContactId: 'contact-1', additionalRecipientCount: 0, emailTemplateId: 'tpl' },
};

afterEach(() => vi.restoreAllMocks());

describe('Admin e-mail history', () => {
  it('shows events, readable blocked reason and status translations', async () => {
    mockApi();
    renderPage();
    expect((await screen.findAllByText('N-2026-001'))[0]).toBeVisible();
    expect(screen.getByText('Brak aktywnego odbiorcy')).toBeVisible();
    expect(screen.getAllByText('Gotowe do wysyłki')).toHaveLength(2);
    expect(screen.getAllByText('W kolejce')).not.toHaveLength(0);
  });

  it('shows that real delivery is not active', () => {
    mockApi();
    renderPage();
    expect(screen.getByRole('note')).toHaveTextContent('nie jest jeszcze aktywna');
  });

  it('changes request parameters when filters change', async () => {
    const fetchMock = mockApi();
    const user = userEvent.setup();
    renderPage();
    await screen.findAllByText('N-2026-001');
    await user.selectOptions(screen.getByLabelText('Status zdarzenia'), 'READY');
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => String(url).includes('eventStatus=READY'))).toBe(true));
  });

  it('opens details and shows deliveries', async () => {
    mockApi();
    const user = userEvent.setup();
    renderPage();
    await screen.findAllByText('N-2026-001');
    await user.click(screen.getAllByRole('button', { name: 'Szczegóły' })[1]);
    expect(await screen.findByRole('dialog', { name: 'Szczegóły zdarzenia' })).toBeVisible();
    expect(screen.getAllByText('anna@example.pl')).toHaveLength(2);
    expect(screen.getByText(/Próby: 0/)).toBeVisible();
  });

  it('reprocesses a blocked event and invalidates the list', async () => {
    const fetchMock = mockApi();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const user = userEvent.setup();
    renderPage();
    await screen.findAllByText('N-2026-001');
    await user.click(screen.getAllByRole('button', { name: 'Szczegóły' })[0]);
    await screen.findByRole('button', { name: 'Przetwórz ponownie' });
    await user.click(screen.getByRole('button', { name: 'Przetwórz ponownie' }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([url, init]) =>
      String(url).endsWith('/admin/emails/event-1/reprocess') && (init as RequestInit).method === 'POST',
    )).toBe(true));
    await waitFor(() => expect(fetchMock.mock.calls.filter(([url]) => String(url).includes('/admin/emails?')).length).toBeGreaterThan(1));
  });
});

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/admin/emails']}><AdminEmailsPage /></MemoryRouter></QueryClientProvider>);
}

function mockApi() {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes('/admin/emails?')) return response({ items: [blocked, ready], page: 1, pageSize: 25, totalCount: 2 });
    if (url.endsWith('/admin/emails/event-1/reprocess')) return response({ ...details, ...blocked });
    if (url.endsWith('/admin/emails/event-1')) return response({ ...details, ...blocked });
    if (url.endsWith('/admin/emails/event-2')) return response(details);
    if (url.includes('/admin/hospitals?')) return response({ items: [blocked.hospital], page: 1, pageSize: 100, totalCount: 1 });
    return response({}, 404);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function response(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}
