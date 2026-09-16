import { useState } from 'react';
import type { AccessoryKind, WorkoutExtras as WorkoutExtrasData } from '../types';
import CustomSelect from './CustomSelect';
import type { PreviousSetValue } from '../lib/previousValues';
import { ACCESSORY_SET_COUNT } from '../lib/state';

const ACCESSORY_OPTIONS: Array<{ value: AccessoryKind; label: string }> = [
  { value: 'abs', label: 'Abdômen' },
  { value: 'calf', label: 'Panturrilha' }
];

type WorkoutExtrasProps = {
  extras: WorkoutExtrasData | undefined;
  getPreviousAccessorySet: (kind: AccessoryKind, setIndex: number) => PreviousSetValue | null;
  onAccessoryKindChange: (kind: AccessoryKind) => void;
  onAccessoryNameChange: (name: string) => void;
  onAccessorySetChange: (setIndex: number, field: 'load' | 'reps', value: string) => void;
  onCardioChange: (field: 'minutes' | 'description', value: string) => void;
};

/**
 * Blocos de controle pessoal no fim do treino (não entram na planilha nem nos totais):
 * Abdômen/Panturrilha com 4 séries vermelhas e Cardio (minutos + o que fez).
 */
function WorkoutExtras({
  extras,
  getPreviousAccessorySet,
  onAccessoryKindChange,
  onAccessoryNameChange,
  onAccessorySetChange,
  onCardioChange
}: WorkoutExtrasProps) {
  const [accessoryOpen, setAccessoryOpen] = useState(false);
  const [cardioOpen, setCardioOpen] = useState(false);

  const kind = extras?.accessory?.kind ?? 'abs';
  const accessorySets = Array.from(
    { length: ACCESSORY_SET_COUNT },
    (_, index) => extras?.accessory?.sets[index] ?? { load: '', reps: '' }
  );
  const doneSets = accessorySets.filter((set) => set.load.trim() || set.reps.trim()).length;
  const kindLabel = ACCESSORY_OPTIONS.find((option) => option.value === kind)?.label ?? '';
  const cardioMinutes = extras?.cardio?.minutes ?? '';
  const cardioDescription = extras?.cardio?.description ?? '';

  const toggleOnHeader = (event: React.MouseEvent, toggle: () => void) => {
    if ((event.target as HTMLElement).closest('button, a, input, textarea')) return;
    toggle();
  };

  return (
    <>
      <article className="exercise-card extras-card">
        <div
          className="exercise-card__header"
          onClick={(e) => toggleOnHeader(e, () => setAccessoryOpen((open) => !open))}
          style={{ cursor: 'pointer' }}
        >
          <div>
            <h3>
              Abdômen / Panturrilha
              <span style={{ fontSize: '0.8em', marginLeft: '8px', opacity: 0.6 }}>{accessoryOpen ? '▼' : '▶'}</span>
            </h3>
            <p>
              {kindLabel}
              {extras?.accessory?.name ? ` · ${extras.accessory.name}` : ''} · {doneSets}/{ACCESSORY_SET_COUNT} séries
            </p>
          </div>
          <span className="extras-card__badge">Só pra você</span>
        </div>

        {accessoryOpen && (
          <div className="set-list">
            <div className="extras-card__fields">
              <CustomSelect
                value={kind}
                onChange={(value) => onAccessoryKindChange(value as AccessoryKind)}
                options={ACCESSORY_OPTIONS}
              />
              <input
                className="extras-card__input"
                type="text"
                placeholder="Exercício (opcional)"
                value={extras?.accessory?.name ?? ''}
                onChange={(e) => onAccessoryNameChange(e.target.value)}
              />
            </div>

            {accessorySets.map((set, setIndex) => {
              const previous = getPreviousAccessorySet(kind, setIndex);
              return (
                <div key={setIndex} className="set-row set-row--red">
                  <div className="set-row__top">
                    <div className="set-row__target">
                      <span>Série {setIndex + 1}</span>
                      <span>Até a falha</span>
                    </div>
                  </div>
                  <div className="set-row__action">
                    <label className="set-field">
                      <span className="set-field__label">Kg</span>
                      <input
                        className="set-field__input"
                        inputMode="decimal"
                        placeholder={previous?.load?.trim() ? previous.load : '0'}
                        value={set.load}
                        onChange={(e) => onAccessorySetChange(setIndex, 'load', e.target.value)}
                      />
                    </label>
                    <label className="set-field">
                      <span className="set-field__label">Reps</span>
                      <input
                        className="set-field__input"
                        inputMode="numeric"
                        placeholder={previous?.reps?.trim() ? previous.reps : '0'}
                        value={set.reps}
                        onChange={(e) => onAccessorySetChange(setIndex, 'reps', e.target.value)}
                      />
                    </label>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </article>

      <article className="exercise-card extras-card">
        <div
          className="exercise-card__header"
          onClick={(e) => toggleOnHeader(e, () => setCardioOpen((open) => !open))}
          style={{ cursor: 'pointer' }}
        >
          <div>
            <h3>
              Cardio
              <span style={{ fontSize: '0.8em', marginLeft: '8px', opacity: 0.6 }}>{cardioOpen ? '▼' : '▶'}</span>
            </h3>
            <p>
              {cardioMinutes ? `${cardioMinutes} min` : '— min'}
              {cardioDescription ? ` · ${cardioDescription}` : ''}
            </p>
          </div>
          <span className="extras-card__badge">Só pra você</span>
        </div>

        {cardioOpen && (
          <div className="set-list">
            <div className="set-row__action">
              <label className="set-field extras-card__minutes">
                <span className="set-field__label">Min</span>
                <input
                  className="set-field__input"
                  inputMode="numeric"
                  placeholder="0"
                  value={cardioMinutes}
                  onChange={(e) => onCardioChange('minutes', e.target.value)}
                />
              </label>
            </div>
            <label className="feedback-field">
              <span>O que fez</span>
              <textarea
                rows={2}
                placeholder="Ex.: esteira inclinada, bike…"
                value={cardioDescription}
                onChange={(e) => onCardioChange('description', e.target.value)}
              />
            </label>
          </div>
        )}
      </article>
    </>
  );
}

export default WorkoutExtras;
