import type { FormEvent } from 'react';
import { APP_NAME } from '../config';

type PinGateProps = {
  pinValue: string;
  errorMessage: string;
  onPinChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

function PinGate({ pinValue, errorMessage, onPinChange, onSubmit }: PinGateProps) {
  return (
    <main className="app-shell pin-screen">
      <section className="pin-card">
        <p className="pin-brand">{APP_NAME}</p>
        <h1>Digite o PIN</h1>

        <form className="pin-form" onSubmit={onSubmit}>
          <label className="field field--pin">
            <span>PIN</span>
            <input
              autoComplete="current-password"
              className="pin-input"
              inputMode="numeric"
              maxLength={8}
              placeholder="PIN"
              type="password"
              value={pinValue}
              onChange={(event) => onPinChange(event.target.value.replace(/\D/g, ''))}
            />
          </label>

          <button className="button button--primary" type="submit">
            Entrar
          </button>

          {errorMessage ? <p className="pin-error">{errorMessage}</p> : null}
        </form>
      </section>
    </main>
  );
}

export default PinGate;