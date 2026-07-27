import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import {
  addAdminUserMembership,
  createAdminUser,
  deleteAdminUser,
  deleteAdminUserMembership,
  updateAdminUserMembership,
  updateAdminUserStatus,
  type AdminHospital,
  type AdminUser,
  type AdminUserMembership,
  type AdminUsersParams,
  type MembershipRole,
  type UserStatus,
} from '../api';
import {
  adminHospitalsQueryOptions,
  adminUsersQueryKey,
  adminUsersQueryOptions,
  useCurrentUser,
} from '../query';
import { generateTemporaryPassword } from '../passwordGenerator';

const PAGE_SIZE = 25;

const userFormSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, 'Adres e-mail jest wymagany.')
    .email('Podaj prawidłowy adres e-mail.')
    .transform((value) => value.toLowerCase()),
  temporaryPassword: z
    .string()
    .min(12, 'Hasło tymczasowe musi mieć co najmniej 12 znaków.')
    .max(256, 'Hasło tymczasowe może mieć maksymalnie 256 znaków.'),
  hospitalId: z.string().min(1, 'Wybierz szpital.'),
  membershipRole: z.enum(['HOSPITAL_USER', 'HOSPITAL_ADMIN']),
});

const membershipFormSchema = z.object({
  hospitalId: z.string().min(1, 'Wybierz szpital.'),
  role: z.enum(['HOSPITAL_USER', 'HOSPITAL_ADMIN']),
});

const roleFormSchema = z.object({
  role: z.enum(['HOSPITAL_USER', 'HOSPITAL_ADMIN']),
});

type UserFormValues = z.input<typeof userFormSchema>;
type MembershipFormValues = z.infer<typeof membershipFormSchema>;
type RoleFormValues = z.infer<typeof roleFormSchema>;
type StatusFilter = 'all' | UserStatus;
type UserDialog =
  | { mode: 'create' }
  | { mode: 'delete'; user: AdminUser }
  | { mode: 'membership'; user: AdminUser }
  | {
      mode: 'role';
      user: AdminUser;
      membership: AdminUserMembership;
    };

export function AdminUsersPage() {
  const { data: currentUser } = useCurrentUser();
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [hospitalId, setHospitalId] = useState('');
  const [dialog, setDialog] = useState<UserDialog | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const params: AdminUsersParams = {
    page,
    pageSize: PAGE_SIZE,
    ...(search ? { search } : {}),
    ...(status === 'all' ? {} : { status }),
    ...(hospitalId ? { hospitalId } : {}),
  };
  const usersQuery = useQuery(adminUsersQueryOptions(params));
  const hospitalsQuery = useQuery(
    adminHospitalsQueryOptions({ page: 1, pageSize: 100 }),
  );
  const invalidateUsers = () =>
    queryClient.invalidateQueries({ queryKey: adminUsersQueryKey });
  const statusMutation = useMutation({
    mutationFn: updateAdminUserStatus,
    onSuccess: invalidateUsers,
  });
  const deleteMembershipMutation = useMutation({
    mutationFn: deleteAdminUserMembership,
    onSuccess: invalidateUsers,
  });

  const totalPages = Math.max(
    1,
    Math.ceil((usersQuery.data?.totalCount ?? 0) / PAGE_SIZE),
  );
  const activeHospitals =
    hospitalsQuery.data?.items.filter((hospital) => hospital.active) ?? [];

  const submitSearch = (event: React.FormEvent) => {
    event.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
  };

  const changeStatus = (user: AdminUser, nextStatus: UserStatus) => {
    if (
      (nextStatus === 'INACTIVE' || nextStatus === 'BLOCKED') &&
      !window.confirm(
        nextStatus === 'BLOCKED'
          ? `Czy na pewno zablokować użytkownika ${user.email}? Wszystkie aktywne sesje zostaną unieważnione.`
          : `Czy na pewno dezaktywować użytkownika ${user.email}? Wszystkie aktywne sesje zostaną unieważnione.`,
      )
    ) {
      return;
    }

    statusMutation.mutate({ id: user.id, status: nextStatus });
  };

  const removeMembership = (
    user: AdminUser,
    membership: AdminUserMembership,
  ) => {
    if (
      !window.confirm(
        `Czy usunąć dostęp użytkownika ${user.email} do szpitala ${membership.hospitalName}?`,
      )
    ) {
      return;
    }

    deleteMembershipMutation.mutate({
      userId: user.id,
      membershipId: membership.id,
    });
  };

  return (
    <section className="users-page" aria-labelledby="users-title">
      <div className="page-title-row">
        <div>
          <p className="eyebrow">Administracja</p>
          <h1 id="users-title">Użytkownicy i dostęp</h1>
          <p>Zarządzaj kontami oraz dostępem do szpitali.</p>
        </div>
        <button
          className="primary-button compact-button"
          type="button"
          onClick={() => setDialog({ mode: 'create' })}
        >
          <span aria-hidden="true">+</span>
          Dodaj użytkownika
        </button>
      </div>

      <div className="hospital-toolbar users-toolbar">
        <form className="hospital-search" onSubmit={submitSearch}>
          <label htmlFor="user-search">Wyszukaj po adresie e-mail</label>
          <div>
            <input
              id="user-search"
              type="search"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="user@example.com"
            />
            <button className="secondary-button compact-button" type="submit">
              Szukaj
            </button>
          </div>
        </form>
        <FilterSelect
          id="user-status-filter"
          label="Status"
          value={status}
          onChange={(value) => {
            setPage(1);
            setStatus(value as StatusFilter);
          }}
          options={[
            ['all', 'Wszystkie'],
            ['ACTIVE', 'Aktywni'],
            ['INACTIVE', 'Nieaktywni'],
            ['BLOCKED', 'Zablokowani'],
          ]}
        />
        <FilterSelect
          id="user-hospital-filter"
          label="Szpital"
          value={hospitalId}
          onChange={(value) => {
            setPage(1);
            setHospitalId(value);
          }}
          options={[
            ['', 'Wszystkie szpitale'],
            ...(hospitalsQuery.data?.items.map(
              (hospital): [string, string] => [
                hospital.id,
                hospital.name,
              ],
            ) ?? []),
          ]}
        />
      </div>

      {(statusMutation.isError ||
        deleteMembershipMutation.isError) && (
        <div className="inline-error" role="alert">
          Nie udało się zapisać zmiany. Spróbuj ponownie.
        </div>
      )}
      {successMessage && (
        <div className="success-banner" role="status">
          {successMessage}
        </div>
      )}

      <div className="hospital-table-card">
        {usersQuery.isPending ? (
          <UsersTableSkeleton />
        ) : usersQuery.isError ? (
          <div className="table-message error-message" role="alert">
            <strong>Nie udało się pobrać listy użytkowników.</strong>
            <span>Sprawdź połączenie i spróbuj ponownie.</span>
            <button
              className="secondary-button compact-button"
              type="button"
              onClick={() => void usersQuery.refetch()}
            >
              Spróbuj ponownie
            </button>
          </div>
        ) : usersQuery.data.items.length === 0 ? (
          <div className="table-message">
            <strong>Nie znaleziono użytkowników</strong>
            <span>Zmień wyszukiwanie lub wybrane filtry.</span>
          </div>
        ) : (
          <>
            <div className="table-scroll">
              <table className="hospital-table users-table">
                <thead>
                  <tr>
                    <th scope="col">Użytkownik</th>
                    <th scope="col">Status</th>
                    <th scope="col">Dostęp</th>
                    <th scope="col">Ostatnie logowanie</th>
                    <th scope="col">Akcje</th>
                  </tr>
                </thead>
                <tbody>
                  {usersQuery.data.items.map((user) => {
                    const isOwnAccount = user.id === currentUser?.id;
                    const rowPending =
                      (statusMutation.isPending &&
                        statusMutation.variables?.id === user.id) ||
                      (deleteMembershipMutation.isPending &&
                        deleteMembershipMutation.variables?.userId ===
                          user.id);

                    return (
                      <tr key={user.id}>
                        <th scope="row">
                          <span className="user-email">{user.email}</span>
                          <span className="user-system-role">
                            {systemRoleLabel(user.systemRole)}
                          </span>
                        </th>
                        <td>
                          <UserStatusBadge status={user.status} />
                        </td>
                        <td>
                          {user.memberships.length === 0 ? (
                            <span className="no-access">Brak dostępu</span>
                          ) : (
                            <ul className="membership-list">
                              {user.memberships.map((membership) => (
                                <li key={membership.id}>
                                  <div>
                                    <strong>
                                      {membership.hospitalName}
                                    </strong>
                                    <span>
                                      {membershipRoleLabel(
                                        membership.role,
                                      )}
                                    </span>
                                  </div>
                                  <div className="membership-actions">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setDialog({
                                          mode: 'role',
                                          user,
                                          membership,
                                        })
                                      }
                                      disabled={rowPending}
                                    >
                                      Zmień rolę
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        removeMembership(user, membership)
                                      }
                                      disabled={rowPending}
                                    >
                                      Usuń dostęp
                                    </button>
                                  </div>
                                </li>
                              ))}
                            </ul>
                          )}
                          <button
                            className="add-access-button"
                            type="button"
                            onClick={() =>
                              setDialog({ mode: 'membership', user })
                            }
                            disabled={rowPending}
                          >
                            + Dodaj dostęp do szpitala
                          </button>
                        </td>
                        <td>{formatLastLogin(user.lastLoginAt)}</td>
                        <td>
                          <div className="row-actions user-row-actions">
                            {user.status !== 'ACTIVE' && (
                              <button
                                type="button"
                                onClick={() => changeStatus(user, 'ACTIVE')}
                                disabled={rowPending}
                              >
                                Aktywuj
                              </button>
                            )}
                            {user.status !== 'INACTIVE' && (
                              <button
                                type="button"
                                onClick={() =>
                                  changeStatus(user, 'INACTIVE')
                                }
                                disabled={rowPending || isOwnAccount}
                                title={
                                  isOwnAccount
                                    ? 'Nie możesz dezaktywować własnego konta'
                                    : undefined
                                }
                              >
                                Dezaktywuj
                              </button>
                            )}
                            {user.status !== 'BLOCKED' && (
                              <button
                                type="button"
                                onClick={() =>
                                  changeStatus(user, 'BLOCKED')
                                }
                                disabled={rowPending || isOwnAccount}
                                title={
                                  isOwnAccount
                                    ? 'Nie możesz zablokować własnego konta'
                                    : undefined
                                }
                              >
                                Zablokuj
                              </button>
                            )}
                            {user.systemRole === 'USER' && (
                              <button
                                className="danger-action"
                                type="button"
                                onClick={() => {
                                  setSuccessMessage(null);
                                  setDialog({ mode: 'delete', user });
                                }}
                                disabled={rowPending}
                              >
                                Usuń konto
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <nav className="pagination" aria-label="Paginacja użytkowników">
              <span>
                Strona {usersQuery.data.page} z {totalPages} ·{' '}
                {usersQuery.data.totalCount} wyników
              </span>
              <div>
                <button
                  className="secondary-button compact-button"
                  type="button"
                  onClick={() => setPage((current) => current - 1)}
                  disabled={page <= 1 || usersQuery.isFetching}
                >
                  Poprzednia
                </button>
                <button
                  className="secondary-button compact-button"
                  type="button"
                  onClick={() => setPage((current) => current + 1)}
                  disabled={
                    page >= totalPages || usersQuery.isFetching
                  }
                >
                  Następna
                </button>
              </div>
            </nav>
          </>
        )}
      </div>

      {dialog?.mode === 'create' && (
        <CreateUserDialog
          hospitals={activeHospitals}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.mode === 'membership' && (
        <MembershipDialog
          user={dialog.user}
          hospitals={activeHospitals}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.mode === 'delete' && (
        <DeleteUserDialog
          user={dialog.user}
          onDeleted={() => {
            setSuccessMessage('Konto zostało usunięte');
            setDialog(null);
          }}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.mode === 'role' && (
        <RoleDialog
          user={dialog.user}
          membership={dialog.membership}
          onClose={() => setDialog(null)}
        />
      )}
    </section>
  );
}

function FilterSelect({
  id,
  label,
  value,
  options,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  options: [string, string][];
  onChange: (value: string) => void;
}) {
  return (
    <div className="hospital-filter">
      <label htmlFor={id}>{label}</label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map(([optionValue, optionLabel]) => (
          <option value={optionValue} key={optionValue || 'all'}>
            {optionLabel}
          </option>
        ))}
      </select>
    </div>
  );
}

function UserStatusBadge({ status }: { status: UserStatus }) {
  const labels: Record<UserStatus, string> = {
    ACTIVE: 'Aktywny',
    INACTIVE: 'Nieaktywny',
    BLOCKED: 'Zablokowany',
  };

  return (
    <span
      className={`status-badge ${
        status === 'ACTIVE'
          ? 'positive'
          : status === 'BLOCKED'
            ? 'negative'
            : 'neutral'
      }`}
    >
      <span className="status-dot" aria-hidden="true" />
      {labels[status]}
    </span>
  );
}

function UsersTableSkeleton() {
  return (
    <div
      className="table-skeleton"
      role="status"
      aria-label="Ładowanie listy użytkowników"
    >
      {[0, 1, 2, 3].map((row) => (
        <div className="skeleton-row users-skeleton-row" key={row}>
          {[0, 1, 2, 3, 4].map((column) => (
            <span key={column} />
          ))}
        </div>
      ))}
    </div>
  );
}

function CreateUserDialog({
  hospitals,
  onClose,
}: {
  hospitals: AdminHospital[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [showPassword, setShowPassword] = useState(false);
  const [copyMessage, setCopyMessage] = useState<string | null>(null);
  const pendingUser = useRef<
    z.output<typeof userFormSchema> | undefined
  >(undefined);
  const {
    register,
    handleSubmit,
    getValues,
    reset,
    setError,
    setValue,
    formState: { errors },
  } = useForm<UserFormValues>({
    defaultValues: {
      email: '',
      temporaryPassword: '',
      hospitalId: '',
      membershipRole: 'HOSPITAL_USER',
    },
  });
  useEffect(() => {
    setValue('temporaryPassword', generateTemporaryPassword(), {
      shouldDirty: false,
      shouldValidate: false,
    });
  }, [setValue]);
  const mutation = useMutation({
    mutationFn: () => {
      if (!pendingUser.current) {
        throw new Error('Missing user form data');
      }
      return createAdminUser(pendingUser.current);
    },
    onSuccess: async () => {
      reset({
        email: '',
        temporaryPassword: '',
        hospitalId: '',
        membershipRole: 'HOSPITAL_USER',
      });
      pendingUser.current = undefined;
      await queryClient.invalidateQueries({
        queryKey: adminUsersQueryKey,
      });
      onClose();
    },
    onSettled: () => {
      pendingUser.current = undefined;
    },
  });

  const submit = (values: UserFormValues) => {
    const validation = userFormSchema.safeParse(values);

    if (!validation.success) {
      applyZodErrors(validation.error, setError);
      return;
    }

    pendingUser.current = validation.data;
    mutation.mutate();
  };

  const generateNewPassword = () => {
    setValue('temporaryPassword', generateTemporaryPassword(), {
      shouldDirty: true,
      shouldValidate: true,
    });
    setCopyMessage(null);
  };

  const copyPassword = async () => {
    try {
      await navigator.clipboard.writeText(
        getValues('temporaryPassword'),
      );
      setCopyMessage('Hasło skopiowano do schowka.');
    } catch {
      setCopyMessage('Nie udało się skopiować hasła.');
    }
  };

  return (
    <DialogFrame
      title="Dodaj użytkownika"
      onClose={onClose}
      pending={mutation.isPending}
    >
      <form onSubmit={handleSubmit(submit)} noValidate>
        <FormField
          id="new-user-email"
          label="Adres e-mail"
          error={errors.email?.message}
        >
          <input
            id="new-user-email"
            type="email"
            autoFocus
            autoComplete="off"
            aria-invalid={Boolean(errors.email)}
            {...register('email')}
          />
        </FormField>
        <FormField
          id="new-user-password"
          label="Hasło tymczasowe"
          error={errors.temporaryPassword?.message}
        >
          <input
            id="new-user-password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            aria-invalid={Boolean(errors.temporaryPassword)}
            {...register('temporaryPassword')}
          />
        </FormField>
        <div className="password-actions">
          <button type="button" onClick={generateNewPassword}>
            Wygeneruj nowe
          </button>
          <button type="button" onClick={() => void copyPassword()}>
            Kopiuj hasło
          </button>
          <button
            type="button"
            aria-pressed={showPassword}
            onClick={() => setShowPassword((visible) => !visible)}
          >
            {showPassword ? 'Ukryj hasło' : 'Pokaż hasło'}
          </button>
        </div>
        {copyMessage && (
          <p
            className={
              copyMessage.startsWith('Hasło skopiowano')
                ? 'copy-success'
                : 'field-error'
            }
            role="status"
          >
            {copyMessage}
          </p>
        )}
        <p className="form-help">
          Hasło musi mieć co najmniej 12 znaków. Automatycznie proponujemy
          silne hasło składające się z 20 znaków.
        </p>
        <FormField
          id="new-user-hospital"
          label="Szpital"
          error={errors.hospitalId?.message}
        >
          <select id="new-user-hospital" {...register('hospitalId')}>
            <option value="">Wybierz szpital</option>
            {hospitals.map((hospital) => (
              <option value={hospital.id} key={hospital.id}>
                {hospital.name}
              </option>
            ))}
          </select>
        </FormField>
        <FormField
          id="new-user-role"
          label="Rola w szpitalu"
          error={errors.membershipRole?.message}
        >
          <select
            id="new-user-role"
            {...register('membershipRole')}
          >
            <RoleOptions />
          </select>
        </FormField>
        <MutationError visible={mutation.isError} />
        <DialogActions
          onClose={onClose}
          pending={mutation.isPending}
          submitLabel="Dodaj użytkownika"
        />
      </form>
    </DialogFrame>
  );
}

function DeleteUserDialog({
  user,
  onDeleted,
  onClose,
}: {
  user: AdminUser;
  onDeleted: () => void;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => deleteAdminUser(user.id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: adminUsersQueryKey,
      });
      onDeleted();
    },
  });

  return (
    <DialogFrame
      title="Usuń konto"
      subtitle={user.email}
      onClose={onClose}
      pending={mutation.isPending}
    >
      <p className="delete-confirmation">
        Konto zostanie wyłączone, wszystkie aktywne sesje zakończone, a
        dostępy do szpitali usunięte. Rekord zostanie zachowany dla historii
        systemu.
      </p>
      <MutationError visible={mutation.isError} />
      <div className="dialog-actions">
        <button
          className="secondary-button compact-button"
          type="button"
          onClick={onClose}
          disabled={mutation.isPending}
        >
          Anuluj
        </button>
        <button
          className="danger-button compact-button"
          type="button"
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending}
        >
          {mutation.isPending ? 'Usuwanie…' : 'Usuń konto'}
        </button>
      </div>
    </DialogFrame>
  );
}

function MembershipDialog({
  user,
  hospitals,
  onClose,
}: {
  user: AdminUser;
  hospitals: AdminHospital[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<MembershipFormValues>({
    defaultValues: {
      hospitalId: '',
      role: 'HOSPITAL_USER',
    },
  });
  const mutation = useMutation({
    mutationFn: (values: MembershipFormValues) =>
      addAdminUserMembership({ userId: user.id, ...values }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: adminUsersQueryKey,
      });
      onClose();
    },
  });

  const submit = (values: MembershipFormValues) => {
    const validation = membershipFormSchema.safeParse(values);

    if (!validation.success) {
      applyZodErrors(validation.error, setError);
      return;
    }

    mutation.mutate(validation.data);
  };

  return (
    <DialogFrame
      title="Dodaj dostęp do szpitala"
      subtitle={user.email}
      onClose={onClose}
      pending={mutation.isPending}
    >
      <form onSubmit={handleSubmit(submit)} noValidate>
        <FormField
          id="membership-hospital"
          label="Szpital"
          error={errors.hospitalId?.message}
        >
          <select
            id="membership-hospital"
            autoFocus
            {...register('hospitalId')}
          >
            <option value="">Wybierz szpital</option>
            {hospitals.map((hospital) => (
              <option value={hospital.id} key={hospital.id}>
                {hospital.name}
              </option>
            ))}
          </select>
        </FormField>
        <FormField
          id="membership-role"
          label="Rola w szpitalu"
          error={errors.role?.message}
        >
          <select id="membership-role" {...register('role')}>
            <RoleOptions />
          </select>
        </FormField>
        <MutationError visible={mutation.isError} />
        <DialogActions
          onClose={onClose}
          pending={mutation.isPending}
          submitLabel="Dodaj dostęp"
        />
      </form>
    </DialogFrame>
  );
}

function RoleDialog({
  user,
  membership,
  onClose,
}: {
  user: AdminUser;
  membership: AdminUserMembership;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const { register, handleSubmit } = useForm<RoleFormValues>({
    defaultValues: { role: membership.role },
  });
  const mutation = useMutation({
    mutationFn: ({ role }: RoleFormValues) =>
      updateAdminUserMembership({
        userId: user.id,
        membershipId: membership.id,
        role,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: adminUsersQueryKey,
      });
      onClose();
    },
  });

  return (
    <DialogFrame
      title="Zmień rolę membership"
      subtitle={`${user.email} · ${membership.hospitalName}`}
      onClose={onClose}
      pending={mutation.isPending}
    >
      <form
        onSubmit={handleSubmit((values) => {
          const validation = roleFormSchema.safeParse(values);
          if (validation.success) {
            mutation.mutate(validation.data);
          }
        })}
      >
        <FormField id="change-role" label="Rola w szpitalu">
          <select id="change-role" autoFocus {...register('role')}>
            <RoleOptions />
          </select>
        </FormField>
        <MutationError visible={mutation.isError} />
        <DialogActions
          onClose={onClose}
          pending={mutation.isPending}
          submitLabel="Zapisz rolę"
        />
      </form>
    </DialogFrame>
  );
}

function DialogFrame({
  title,
  subtitle,
  onClose,
  pending,
  children,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  pending: boolean;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !pending) {
        onClose();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose, pending]);

  return (
    <div className="modal-layer">
      <button
        className="modal-backdrop"
        type="button"
        aria-label="Zamknij formularz"
        onClick={onClose}
        disabled={pending}
      />
      <section
        className="hospital-dialog user-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="user-dialog-title"
      >
        <p className="eyebrow">Użytkownicy i dostęp</p>
        <h2 id="user-dialog-title">{title}</h2>
        {subtitle && <p className="dialog-subtitle">{subtitle}</p>}
        {children}
      </section>
    </div>
  );
}

function FormField({
  id,
  label,
  error,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children}
      {error && <p className="field-error">{error}</p>}
    </div>
  );
}

function DialogActions({
  onClose,
  pending,
  submitLabel,
}: {
  onClose: () => void;
  pending: boolean;
  submitLabel: string;
}) {
  return (
    <div className="dialog-actions">
      <button
        className="secondary-button compact-button"
        type="button"
        onClick={onClose}
        disabled={pending}
      >
        Anuluj
      </button>
      <button
        className="primary-button compact-button"
        type="submit"
        disabled={pending}
      >
        {pending ? 'Zapisywanie…' : submitLabel}
      </button>
    </div>
  );
}

function MutationError({ visible }: { visible: boolean }) {
  return visible ? (
    <div className="inline-error" role="alert">
      Nie udało się zapisać zmiany. Sprawdź dane i spróbuj ponownie.
    </div>
  ) : null;
}

function RoleOptions() {
  return (
    <>
      <option value="HOSPITAL_USER">Użytkownik szpitala</option>
      <option value="HOSPITAL_ADMIN">Administrator szpitala</option>
    </>
  );
}

function applyZodErrors<T extends Record<string, unknown>>(
  error: z.ZodError,
  setError: ReturnType<typeof useForm<T>>['setError'],
) {
  const seen = new Set<string>();
  for (const issue of error.issues) {
    const field = String(issue.path[0]);
    if (!seen.has(field)) {
      seen.add(field);
      setError(field as Parameters<typeof setError>[0], {
        type: 'validation',
        message: issue.message,
      });
    }
  }
}

function membershipRoleLabel(role: MembershipRole): string {
  return role === 'HOSPITAL_ADMIN'
    ? 'Administrator szpitala'
    : 'Użytkownik szpitala';
}

function systemRoleLabel(role: AdminUser['systemRole']): string {
  if (role === 'EMMA_ADMIN') {
    return 'Administrator Emma';
  }
  if (role === 'SERVICE_OPERATOR') {
    return 'Operator serwisowy';
  }
  return 'Użytkownik';
}

function formatLastLogin(value: string | null): string {
  if (!value) {
    return 'Nigdy';
  }

  return new Intl.DateTimeFormat('pl-PL', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}
