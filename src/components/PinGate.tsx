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
        <p className="eyebrow">{APP_NAME}</p>
        <h1>Abra a ficha sem depender da planilha.</h1>
        <p className="lead">
          Os dados ficam no aparelho, funcionam offline e podem ser exportados para backup.
        </p>

        <form className="pin-form" onSubmit={onSubmit}>
          <label className="field field--pin">
            <span>PIN</span>
            <input
              autoComplete="current-password"
              className="pin-input"
              inputMode="numeric"
              maxLength={8}
              placeholder="Digite o PIN"
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