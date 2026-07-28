import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  createHospitalContact,
  getAdminHospital,
  getAdminUsers,
  getHospitalCommunication,
  getHospitalContacts,
  updateAdminHospital,
  updateHospitalCommunication,
  updateHospitalContact,
  type AdminHospital,
  type ContactInput,
  type HospitalContact,
} from '../api';

type Tab = 'information' | 'contacts' | 'communication';
type ContactDialog =
  | { kind: 'form'; contact?: HospitalContact }
  | { kind: 'link'; contact: HospitalContact }
  | null;

export function AdminHospitalDetailsPage() {
  const { id = '' } = useParams();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>('information');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState('');
  const [dialog, setDialog] = useState<ContactDialog>(null);
  const hospital = useQuery({
    queryKey: ['admin-hospital', id],
    queryFn: () => getAdminHospital(id),
  });
  const contactsKey = ['hospital-contacts', id] as const;
  const communicationKey = ['hospital-communication', id] as const;
  const contacts = useQuery({
    queryKey: [...contactsKey, search, activeFilter],
    queryFn: () =>
      getHospitalContacts(id, {
        page: 1,
        pageSize: 100,
        ...(search ? { search } : {}),
        ...(activeFilter
          ? { active: activeFilter === 'active' }
          : {}),
      }),
  });
  const activeContactOptions = useQuery({
    queryKey: [...contactsKey, 'active-options'],
    queryFn: () =>
      getHospitalContacts(id, {
        page: 1,
        pageSize: 100,
        active: true,
      }),
  });
  const communication = useQuery({
    queryKey: communicationKey,
    queryFn: () => getHospitalCommunication(id),
  });
  const refreshContactsAndCommunication = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: contactsKey }),
      queryClient.invalidateQueries({ queryKey: communicationKey }),
    ]);
  };
  const stateMutation = useMutation({
    mutationFn: ({
      contact,
      active,
    }: {
      contact: HospitalContact;
      active: boolean;
    }) =>
      updateHospitalContact({
        hospitalId: id,
        contactId: contact.id,
        data: { active },
      }),
    onSuccess: refreshContactsAndCommunication,
  });

  if (hospital.isPending) return <p role="status">Ładowanie szpitala…</p>;
  if (hospital.isError) {
    return <div role="alert">Nie udało się pobrać danych szpitala.</div>;
  }

  return (
    <section className="hospital-details" aria-labelledby="hospital-title">
      <Link className="back-link" to="/admin/hospitals">
        ← Wróć do szpitali
      </Link>
      <div className="page-title-row">
        <div>
          <p className="eyebrow">Konfiguracja szpitala</p>
          <h1 id="hospital-title">{hospital.data.name}</h1>
          <p>Zarządzaj informacjami, kontaktami i komunikacją e-mail.</p>
        </div>
      </div>
      <div className="details-tabs" role="tablist" aria-label="Sekcje szpitala">
        {[
          ['information', 'Informacje'],
          ['contacts', 'Kontakty'],
          ['communication', 'Komunikacja'],
        ].map(([value, label]) => (
          <button
            key={value}
            role="tab"
            aria-selected={tab === value}
            type="button"
            onClick={() => setTab(value as Tab)}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'information' && (
        <InformationTab hospital={hospital.data} />
      )}
      {tab === 'contacts' && (
        <div role="tabpanel" aria-label="Kontakty">
          <div className="page-title-row compact-title">
            <div>
              <h2>Kontakty szpitala</h2>
              <p>
                Lista osób, które mogą być odbiorcami przyszłych wiadomości.
              </p>
            </div>
            <button
              className="primary-button compact-button"
              type="button"
              onClick={() => setDialog({ kind: 'form' })}
            >
              + Dodaj kontakt
            </button>
          </div>
          <div className="hospital-toolbar">
            <form
              className="hospital-search"
              onSubmit={(event) => {
                event.preventDefault();
                setSearch(searchInput.trim());
              }}
            >
              <label htmlFor="contact-search">Wyszukaj kontakt</label>
              <div>
                <input
                  id="contact-search"
                  type="search"
                  value={searchInput}
                  onChange={(event) => setSearchInput(event.target.value)}
                  placeholder="Imię, e-mail, telefon lub stanowisko"
                />
                <button className="secondary-button compact-button">
                  Szukaj
                </button>
              </div>
            </form>
            <div className="hospital-filter">
              <label htmlFor="contact-active">Aktywność</label>
              <select
                id="contact-active"
                value={activeFilter}
                onChange={(event) => setActiveFilter(event.target.value)}
              >
                <option value="">Wszystkie</option>
                <option value="active">Aktywne</option>
                <option value="inactive">Nieaktywne</option>
              </select>
            </div>
          </div>
          {stateMutation.isError && (
            <div className="inline-error" role="alert">
              Nie udało się zmienić statusu kontaktu.
            </div>
          )}
          <ContactsTable
            contacts={contacts.data?.items ?? []}
            loading={contacts.isPending}
            onEdit={(contact) => setDialog({ kind: 'form', contact })}
            onLink={(contact) => setDialog({ kind: 'link', contact })}
            onToggle={(contact) =>
              stateMutation.mutate({
                contact,
                active: !contact.active,
              })
            }
            onUnlink={(contact) =>
              updateHospitalContact({
                hospitalId: id,
                contactId: contact.id,
                data: { linkedUserId: null },
              }).then(refreshContactsAndCommunication)
            }
          />
        </div>
      )}
      {tab === 'communication' && (
        <CommunicationTab
          hospitalId={id}
          contacts={activeContactOptions.data?.items ?? []}
          configuration={communication.data}
          loading={
            communication.isPending || activeContactOptions.isPending
          }
        />
      )}
      {dialog?.kind === 'form' && (
        <ContactFormDialog
          hospitalId={id}
          contact={dialog.contact}
          onClose={() => setDialog(null)}
          onSaved={refreshContactsAndCommunication}
        />
      )}
      {dialog?.kind === 'link' && (
        <LinkUserDialog
          hospitalId={id}
          contact={dialog.contact}
          onClose={() => setDialog(null)}
          onSaved={refreshContactsAndCommunication}
        />
      )}
    </section>
  );
}

function InformationTab({ hospital }: { hospital: AdminHospital }) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: updateAdminHospital,
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['admin-hospital', hospital.id],
      });
    },
  });
  return (
    <div className="details-card" role="tabpanel" aria-label="Informacje">
      <h2>Informacje o szpitalu</h2>
      <dl className="hospital-summary">
        <div><dt>Nazwa</dt><dd>{hospital.name}</dd></div>
        <div><dt>Status aktywności</dt><dd>{hospital.active ? 'Aktywny' : 'Nieaktywny'}</dd></div>
        <div><dt>Stan portalu</dt><dd>{hospital.portalEnabled ? 'Włączony' : 'Wyłączony'}</dd></div>
      </dl>
      <div className="details-actions">
        <button
          className="secondary-button compact-button"
          type="button"
          onClick={() =>
            mutation.mutate({
              id: hospital.id,
              data: { active: !hospital.active },
            })
          }
        >
          {hospital.active ? 'Dezaktywuj szpital' : 'Aktywuj szpital'}
        </button>
        <button
          className="secondary-button compact-button"
          type="button"
          onClick={() =>
            mutation.mutate({
              id: hospital.id,
              data: { portalEnabled: !hospital.portalEnabled },
            })
          }
        >
          {hospital.portalEnabled ? 'Wyłącz portal' : 'Włącz portal'}
        </button>
      </div>
    </div>
  );
}

function ContactsTable({
  contacts,
  loading,
  onEdit,
  onLink,
  onToggle,
  onUnlink,
}: {
  contacts: HospitalContact[];
  loading: boolean;
  onEdit: (contact: HospitalContact) => void;
  onLink: (contact: HospitalContact) => void;
  onToggle: (contact: HospitalContact) => void;
  onUnlink: (contact: HospitalContact) => void;
}) {
  return (
    <div className="hospital-table-card">
      {loading ? (
        <p className="table-message">Ładowanie kontaktów…</p>
      ) : contacts.length === 0 ? (
        <p className="table-message">Brak kontaktów dla wybranych filtrów.</p>
      ) : (
        <div className="table-scroll">
          <table className="hospital-table contacts-table">
            <thead>
              <tr>
                <th>Imię i nazwisko</th><th>E-mail</th><th>Telefon</th>
                <th>Stanowisko</th><th>Konto użytkownika</th><th>Status</th>
                <th>Akcje</th>
              </tr>
            </thead>
            <tbody>
              {contacts.map((contact) => (
                <tr key={contact.id}>
                  <th>{contact.name}</th>
                  <td>{contact.email}</td>
                  <td>{contact.phone ?? '—'}</td>
                  <td>{contact.jobTitle ?? '—'}</td>
                  <td>{contact.linkedUser?.email ?? 'Niepowiązany'}</td>
                  <td>{contact.active ? 'Aktywny' : 'Nieaktywny'}</td>
                  <td>
                    <div className="row-actions">
                      <button type="button" onClick={() => onEdit(contact)}>Edytuj</button>
                      <button type="button" onClick={() => onToggle(contact)}>
                        {contact.active ? 'Dezaktywuj' : 'Aktywuj'}
                      </button>
                      {contact.linkedUser ? (
                        <button type="button" onClick={() => onUnlink(contact)}>
                          Usuń powiązanie z użytkownikiem
                        </button>
                      ) : (
                        <button type="button" onClick={() => onLink(contact)}>
                          Powiąż z użytkownikiem
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ContactFormDialog({
  hospitalId,
  contact,
  onClose,
  onSaved,
}: {
  hospitalId: string;
  contact?: HospitalContact;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [values, setValues] = useState<ContactInput>({
    name: contact?.name ?? '',
    email: contact?.email ?? '',
    phone: contact?.phone ?? null,
    jobTitle: contact?.jobTitle ?? null,
  });
  const mutation = useMutation({
    mutationFn: () =>
      contact
        ? updateHospitalContact({
            hospitalId,
            contactId: contact.id,
            data: values,
          })
        : createHospitalContact({ hospitalId, data: values }),
    onSuccess: async () => {
      await onSaved();
      onClose();
    },
  });
  const change = (field: keyof ContactInput, value: string) =>
    setValues((current) => ({
      ...current,
      [field]: field === 'name' || field === 'email' ? value : value || null,
    }));
  return (
    <Modal title={contact ? 'Edytuj kontakt' : 'Dodaj kontakt'} onClose={onClose}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          mutation.mutate();
        }}
      >
        <p className="dialog-subtitle">
          Kontakt może otrzymywać wiadomości, ale nie musi posiadać konta w portalu.
        </p>
        {[
          ['name', 'Imię i nazwisko', true],
          ['email', 'E-mail', true],
          ['phone', 'Telefon', false],
          ['jobTitle', 'Stanowisko', false],
        ].map(([field, label, required]) => (
          <label className="field" key={String(field)}>
            {String(label)}
            <input
              type={field === 'email' ? 'email' : 'text'}
              required={Boolean(required)}
              maxLength={field === 'email' ? 320 : 200}
              value={String(values[field as keyof ContactInput] ?? '')}
              onChange={(event) =>
                change(field as keyof ContactInput, event.target.value)
              }
            />
          </label>
        ))}
        {mutation.isError && <div className="inline-error" role="alert">Nie udało się zapisać kontaktu.</div>}
        <DialogActions pending={mutation.isPending} onClose={onClose} />
      </form>
    </Modal>
  );
}

function LinkUserDialog({
  hospitalId,
  contact,
  onClose,
  onSaved,
}: {
  hospitalId: string;
  contact: HospitalContact;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const users = useQuery({
    queryKey: ['hospital-user-options', hospitalId],
    queryFn: () =>
      getAdminUsers({ page: 1, pageSize: 100, hospitalId }),
  });
  const [userId, setUserId] = useState('');
  const selected = users.data?.items.find((user) => user.id === userId);
  const mutation = useMutation({
    mutationFn: () =>
      updateHospitalContact({
        hospitalId,
        contactId: contact.id,
        data: { linkedUserId: userId },
      }),
    onSuccess: async () => {
      await onSaved();
      onClose();
    },
  });
  return (
    <Modal title="Powiąż z użytkownikiem" onClose={onClose}>
      <form onSubmit={(event) => { event.preventDefault(); mutation.mutate(); }}>
        <label className="field">
          Konto użytkownika
          <select required value={userId} onChange={(event) => setUserId(event.target.value)}>
            <option value="">Wybierz użytkownika</option>
            {(users.data?.items ?? []).map((user) => (
              <option key={user.id} value={user.id}>{user.email}</option>
            ))}
          </select>
        </label>
        {selected && selected.email.toLowerCase() !== contact.email.toLowerCase() && (
          <div className="configuration-warning" role="alert">
            Adres e-mail kontaktu różni się od adresu konta użytkownika.
          </div>
        )}
        <DialogActions pending={mutation.isPending} onClose={onClose} />
      </form>
    </Modal>
  );
}

function CommunicationTab({
  hospitalId,
  contacts,
  configuration,
  loading,
}: {
  hospitalId: string;
  contacts: HospitalContact[];
  configuration: Awaited<ReturnType<typeof getHospitalCommunication>> | undefined;
  loading: boolean;
}) {
  const queryClient = useQueryClient();
  const activeContacts = useMemo(
    () => contacts.filter((contact) => contact.active),
    [contacts],
  );
  const [draft, setDraft] = useState<{
    enabled: boolean;
    primaryContactId: string;
    recipientContactIds: string[];
  } | null>(null);
  const values = draft ?? {
    enabled: configuration?.enabled ?? false,
    primaryContactId: configuration?.primaryContact?.id ?? '',
    recipientContactIds: configuration?.recipients.map((item) => item.id) ?? [],
  };
  const mutation = useMutation({
    mutationFn: () =>
      updateHospitalCommunication({
        hospitalId,
        data: {
          enabled: values.enabled,
          primaryContactId: values.primaryContactId || null,
          recipientContactIds: values.recipientContactIds,
        },
      }),
    onSuccess: async () => {
      setDraft(null);
      await queryClient.invalidateQueries({
        queryKey: ['hospital-communication', hospitalId],
      });
    },
  });
  const update = (next: Partial<typeof values>) =>
    setDraft({ ...values, ...next });
  if (loading) return <p role="status">Ładowanie ustawień komunikacji…</p>;
  return (
    <div className="details-card communication-card" role="tabpanel" aria-label="Komunikacja">
      <h2>Komunikacja e-mail</h2>
      <label className="toggle-field">
        <input
          type="checkbox"
          checked={values.enabled}
          onChange={(event) => update({ enabled: event.target.checked })}
        />
        Komunikacja e-mail włączona
      </label>
      {!values.enabled && (
        <p className="configuration-note">
          Automatyczne wiadomości dla tego szpitala są wyłączone.
        </p>
      )}
      <label className="field">
        Kontakt główny
        <select
          value={values.primaryContactId}
          onChange={(event) => update({ primaryContactId: event.target.value })}
        >
          <option value="">Nie wskazano</option>
          {activeContacts.map((contact) => (
            <option value={contact.id} key={contact.id}>
              {contact.name} — {contact.email}
            </option>
          ))}
        </select>
      </label>
      <fieldset className="recipient-selector">
        <legend>Dodatkowi odbiorcy</legend>
        {activeContacts.length === 0 ? <p>Brak aktywnych kontaktów.</p> : activeContacts.map((contact) => (
          <label key={contact.id}>
            <input
              type="checkbox"
              checked={values.recipientContactIds.includes(contact.id)}
              onChange={(event) =>
                update({
                  recipientContactIds: event.target.checked
                    ? [...values.recipientContactIds, contact.id]
                    : values.recipientContactIds.filter((id) => id !== contact.id),
                })
              }
            />
            {contact.name} <span>{contact.email}</span>
          </label>
        ))}
      </fieldset>
      <div className={`configuration-summary ${configuration?.configurationComplete ? 'complete' : 'incomplete'}`}>
        <strong>
          {configuration?.configurationComplete
            ? 'Konfiguracja kompletna'
            : 'Konfiguracja niekompletna'}
        </strong>
        {values.enabled && !values.primaryContactId && (
          <p role="alert">
            Komunikacja jest włączona, ale nie wskazano kontaktu głównego. Wiadomości nie będą wysyłane.
          </p>
        )}
        {(configuration?.configurationWarnings ?? []).map((warning) => (
          <p key={warning}>{warning}</p>
        ))}
      </div>
      {mutation.isError && <div className="inline-error" role="alert">Nie udało się zapisać ustawień.</div>}
      <button
        className="primary-button compact-button"
        type="button"
        disabled={mutation.isPending}
        onClick={() => mutation.mutate()}
      >
        {mutation.isPending ? 'Zapisywanie…' : 'Zapisz ustawienia'}
      </button>
    </div>
  );
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="modal-layer">
      <button className="modal-backdrop" aria-label="Zamknij formularz" onClick={onClose} />
      <section className="hospital-dialog contact-dialog" role="dialog" aria-modal="true" aria-label={title}>
        <h2>{title}</h2>
        {children}
      </section>
    </div>
  );
}

function DialogActions({
  pending,
  onClose,
}: {
  pending: boolean;
  onClose: () => void;
}) {
  return (
    <div className="dialog-actions">
      <button className="secondary-button compact-button" type="button" onClick={onClose}>Anuluj</button>
      <button className="primary-button compact-button" type="submit" disabled={pending}>
        {pending ? 'Zapisywanie…' : 'Zapisz'}
      </button>
    </div>
  );
}
