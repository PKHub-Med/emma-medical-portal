import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { defaultPathFor } from '../App';
import { login } from '../api';
import {
  currentUserQueryKey,
  currentUserQueryOptions,
} from '../query';

const loginSchema = z.object({
  email: z
    .string()
    .min(1, 'Adres e-mail jest wymagany.')
    .email('Podaj prawidłowy adres e-mail.'),
  password: z.string().min(1, 'Hasło jest wymagane.'),
});

type LoginForm = z.infer<typeof loginSchema>;

const invalidCredentialsMessage =
  'Nieprawidłowy e-mail lub hasło.';

export function LoginPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [loginError, setLoginError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<LoginForm>({
    defaultValues: {
      email: '',
      password: '',
    },
  });
  const loginMutation = useMutation({
    mutationFn: login,
    onSuccess: async () => {
      queryClient.removeQueries({ queryKey: currentUserQueryKey });
      const user = await queryClient.fetchQuery(
        currentUserQueryOptions(),
      );
      navigate(defaultPathFor(user), { replace: true });
    },
    onError: () => {
      setLoginError(invalidCredentialsMessage);
    },
  });

  const onSubmit = (values: LoginForm) => {
    const validation = loginSchema.safeParse(values);

    if (!validation.success) {
      const invalidFields = new Set<string>();

      for (const issue of validation.error.issues) {
        const field = issue.path[0];

        if (
          (field === 'email' || field === 'password') &&
          !invalidFields.has(field)
        ) {
          invalidFields.add(field);
          setError(field, {
            type: 'validation',
            message: issue.message,
          });
        }
      }

      return;
    }

    setLoginError(null);
    loginMutation.mutate(validation.data);
  };

  return (
    <main className="login-page">
      <section className="login-card" aria-labelledby="login-title">
        <div className="brand" aria-label="Emma">
          Emma
        </div>
        <div className="login-heading">
          <p className="eyebrow">Portal aparatury medycznej</p>
          <h1 id="login-title">Zaloguj się</h1>
          <p>Wprowadź dane swojego konta, aby przejść do portalu.</p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <div className="field">
            <label htmlFor="email">Adres e-mail</label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              aria-invalid={Boolean(errors.email)}
              aria-describedby={errors.email ? 'email-error' : undefined}
              {...register('email')}
            />
            {errors.email && (
              <p className="field-error" id="email-error">
                {errors.email.message}
              </p>
            )}
          </div>

          <div className="field">
            <label htmlFor="password">Hasło</label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              aria-invalid={Boolean(errors.password)}
              aria-describedby={
                errors.password ? 'password-error' : undefined
              }
              {...register('password')}
            />
            {errors.password && (
              <p className="field-error" id="password-error">
                {errors.password.message}
              </p>
            )}
          </div>

          {loginError && (
            <div className="form-error" role="alert">
              {loginError}
            </div>
          )}

          <button
            className="primary-button"
            type="submit"
            disabled={loginMutation.isPending}
          >
            {loginMutation.isPending ? 'Logowanie…' : 'Zaloguj się'}
          </button>
        </form>
      </section>
    </main>
  );
}
