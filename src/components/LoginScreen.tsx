import type { FormEvent } from 'react';

type LoginScreenProps = {
  email: string;
  password: string;
  error: string;
  status: string;
  isBusy: boolean;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onSignIn: (event: FormEvent<HTMLFormElement>) => void;
  onSignUp: () => void;
};

function LoginScreen({
  email,
  password,
  error,
  status,
  isBusy,
  onEmailChange,
  onPasswordChange,
  onSignIn,
  onSignUp
}: LoginScreenProps) {
  return (
    <main className="login-screen">
      <section className="login-card">
        <div className="login-brand">
          <div className="login-brand-icon" aria-hidden="true">
            💪
          </div>
          <h1>Gym Local</h1>
          <p>Ficha de cargas inteligente</p>
        </div>

        <form className="login-form" onSubmit={onSignIn}>
          <div className="login-field">
            <label htmlFor="login-email">Email</label>
            <input
              id="login-email"
              autoComplete="email"
              inputMode="email"
              type="email"
              placeholder="seu@email.com"
              value={email}
              onChange={(event) => onEmailChange(event.target.value)}
            />
          </div>

          <div className="login-field">
            <label htmlFor="login-password">Senha</label>
            <input
              id="login-password"
              autoComplete="current-password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(event) => onPasswordChange(event.target.value)}
            />
          </div>

          {error ? <p className="login-error">{error}</p> : null}

          <div className="login-actions">
            <button className="btn btn--primary btn--full" type="submit" disabled={isBusy}>
              {isBusy ? 'Entrando...' : 'Entrar'}
            </button>
            <button
              className="btn btn--ghost btn--full"
              type="button"
              disabled={isBusy}
              onClick={onSignUp}
            >
              Criar conta
            </button>
          </div>

          {status ? <p className="login-status">{status}</p> : null}
        </form>
      </section>
    </main>
  );
}

export default LoginScreen;
