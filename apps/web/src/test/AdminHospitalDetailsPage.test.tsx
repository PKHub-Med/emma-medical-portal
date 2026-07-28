import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import type {
  AdminHospital,
  CommunicationConfiguration,
  HospitalContact,
} from '../api';

const hospital: AdminHospital = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Szpital Testowy',
  active: true,
  portalEnabled: true,
  departmentsCount: 2,
  membershipsCount: 1,
  createdAt: '2026-07-28T10:00:00.000Z',
  updatedAt: '2026-07-28T10:00:00.000Z',
};
const activeContact: HospitalContact = {
  id: '22222222-2222-4222-8222-222222222222',
  name: 'Anna Kowalska',
  email: 'anna@szpital.pl',
  phone: '+48 123',
  jobTitle: 'Administracja',
  active: true,
  linkedUser: null,
  createdAt: '2026-07-28T10:00:00.000Z',
  updatedAt: '2026-07-28T10:00:00.000Z',
};
const inactiveContact: HospitalContact = {
  ...activeContact,
  id: '33333333-3333-4333-8333-333333333333',
  name: 'Piotr Nieaktywny',
  email: 'piotr@szpital.pl',
  active: false,
};
const communication: CommunicationConfiguration = {
  hospital: { id: hospital.id, name: hospital.name },
  enabled: false,
  primaryContact: null,
  recipients: [],
  configurationComplete: false,
  configurationWarnings: [
    'Komunikacja e-mail jest wyłączona.',
    'Nie wskazano kontaktu głównego.',
  ],
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Admin hospital details', () => {
  it('shows the contacts list', async () => {
    mockHospitalApi();
    renderPage();
    await userEvent.click(await screen.findByRole('tab', { name: 'Kontakty' }));
    expect(await screen.findByText('Anna Kowalska')).toBeInTheDocument();
    expect(screen.getByText('Piotr Nieaktywny')).toBeInTheDocument();
  });

  it('creates a contact from the form and refreshes the list', async () => {
    const requests = mockHospitalApi();
    renderPage();
    await userEvent.click(await screen.findByRole('tab', { name: 'Kontakty' }));
    await userEvent.click(screen.getByRole('button', { name: /Dodaj kontakt/ }));
    await userEvent.type(screen.getByLabelText('Imię i nazwisko'), 'Jan Nowak');
    await userEvent.type(screen.getByLabelText('E-mail'), 'jan@szpital.pl');
    await userEvent.click(screen.getByRole('button', { name: 'Zapisz' }));
    await waitFor(() =>
      expect(requests).toHaveBeenCalledWith(
        expect.stringContaining(`/admin/hospitals/${hospital.id}/contacts`),
        expect.objectContaining({ method: 'POST' }),
      ),
    );
  });

  it('deactivates a contact and refreshes communication settings', async () => {
    const requests = mockHospitalApi();
    renderPage();
    await userEvent.click(await screen.findByRole('tab', { name: 'Kontakty' }));
    await screen.findByText('Anna Kowalska');
    await userEvent.click(screen.getAllByRole('button', { name: 'Dezaktywuj' })[0]);
    await waitFor(() =>
      expect(requests).toHaveBeenCalledWith(
        expect.stringContaining(activeContact.id),
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ active: false }),
        }),
      ),
    );
    await waitFor(() => {
      const communicationGets = requests.mock.calls.filter(
        ([url, init]) =>
          String(url).endsWith('/communication') && !init?.method,
      );
      expect(communicationGets.length).toBeGreaterThan(1);
    });
  });

  it('links a contact to a hospital user and warns when e-mails differ', async () => {
    const requests = mockHospitalApi();
    renderPage();
    await userEvent.click(await screen.findByRole('tab', { name: 'Kontakty' }));
    await screen.findByText('Anna Kowalska');
    await userEvent.click(
      screen.getAllByRole('button', { name: 'Powiąż z użytkownikiem' })[0],
    );
    await userEvent.selectOptions(
      await screen.findByLabelText('Konto użytkownika'),
      'user-1',
    );
    expect(
      screen.getByText(
        'Adres e-mail kontaktu różni się od adresu konta użytkownika.',
      ),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Zapisz' }));
    await waitFor(() =>
      expect(requests).toHaveBeenCalledWith(
        expect.stringContaining(activeContact.id),
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ linkedUserId: 'user-1' }),
        }),
      ),
    );
  });

  it('shows only active contacts in communication selectors and warns without primary', async () => {
    mockHospitalApi();
    renderPage();
    await userEvent.click(
      await screen.findByRole('tab', { name: 'Komunikacja' }),
    );
    const primary = await screen.findByLabelText('Kontakt główny');
    expect(primary).toHaveTextContent('Anna Kowalska');
    expect(primary).not.toHaveTextContent('Piotr Nieaktywny');
    fireEvent.click(
      screen.getByRole('checkbox', {
        name: 'Komunikacja e-mail włączona',
      }),
    );
    expect(
      screen.getByText(
        'Komunikacja jest włączona, ale nie wskazano kontaktu głównego. Wiadomości nie będą wysyłane.',
      ),
    ).toBeInTheDocument();
  });

  it('saves settings and invalidates communication data', async () => {
    const requests = mockHospitalApi();
    renderPage();
    await userEvent.click(
      await screen.findByRole('tab', { name: 'Komunikacja' }),
    );
    await screen.findByLabelText('Kontakt główny');
    await userEvent.click(
      screen.getByRole('button', { name: 'Zapisz ustawienia' }),
    );
    await waitFor(() =>
      expect(requests).toHaveBeenCalledWith(
        expect.stringContaining('/communication'),
        expect.objectContaining({ method: 'PUT' }),
      ),
    );
    await waitFor(() => {
      const gets = requests.mock.calls.filter(
        ([url, init]) =>
          String(url).endsWith('/communication') && !init?.method,
      );
      expect(gets.length).toBeGreaterThan(1);
    });
  });
});

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/admin/hospitals/${hospital.id}`]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function mockHospitalApi() {
  const fetchMock = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/me')) {
        return response({
          id: 'admin',
          email: 'admin@emma.pl',
          status: 'ACTIVE',
          systemRole: 'EMMA_ADMIN',
          memberships: [],
        });
      }
      if (
        url.endsWith(`/admin/hospitals/${hospital.id}`) &&
        !init?.method
      ) {
        return response(hospital);
      }
      if (url.includes(`/admin/hospitals/${hospital.id}/contacts?`)) {
        return response({
          items: [activeContact, inactiveContact],
          page: 1,
          pageSize: 100,
          totalCount: 2,
        });
      }
      if (url.endsWith(`/admin/hospitals/${hospital.id}/communication`)) {
        return response(communication);
      }
      if (url.includes('/admin/users?')) {
        return response({
          items: [
            {
              id: 'user-1',
              email: 'inne-konto@szpital.pl',
              status: 'ACTIVE',
              systemRole: 'USER',
              lastLoginAt: null,
              createdAt: '2026-07-28T10:00:00.000Z',
              memberships: [],
            },
          ],
          page: 1,
          pageSize: 100,
          totalCount: 1,
        });
      }
      if (
        url.endsWith(`/admin/hospitals/${hospital.id}/contacts`) &&
        init?.method === 'POST'
      ) {
        return response(activeContact);
      }
      if (
        url.includes(`/admin/hospitals/${hospital.id}/contacts/`) &&
        init?.method === 'PATCH'
      ) {
        return response(activeContact);
      }
      throw new Error(`Unexpected request: ${url} ${init?.method ?? 'GET'}`);
    },
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function response(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => body,
  } as Response;
}
