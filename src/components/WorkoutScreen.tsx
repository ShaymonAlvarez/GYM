import type { AppState, ExerciseTemplate, ExerciseLog, SetType } from '../types';

type WorkoutScreenProps = {
  appState: AppState;
  activeEntries: Array<{ template: ExerciseTemplate; log: ExerciseLog | undefined }>;
  activeWorkout: AppState['templates'][number];
  workoutStartedAt: number | null;
  workoutEndedAt: number | null;
  workoutElapsedSeconds: number;
  activeExerciseTimer: { exerciseId: string; startedAt: number } | null;
  now: number;
  restDurationSeconds: number;
  restRemainingSeconds: number;
  saveStatus: 'saved' | 'saving' | 'dirty';
  formatMetric: (value: number | null, maxFractionDigits?: number) => string;
  formatDuration: (seconds: number) => string;
  getSetTypeLabel: (type: SetType) => string;
  onSetValueChange: (exerciseId: string, slotIndex: number, field: 'load' | 'reps', value: string) => void;
  onWorkoutStart: () => void;
  onWorkoutEnd: () => void;
  onExerciseTimerToggle: (exerciseId: string) => void;
  onRestDurationChange: (seconds: number) => void;
  onRestStart: () => void;
  onRestReset: () => void;
  onSave: () => void;
  onCopyPrevious: () => void;
  onClearWeek: () => void;
};

function WorkoutScreen({
  appState,
  activeEntries,
  activeWorkout,
  workoutStartedAt,
  workoutEndedAt,
  workoutElapsedSeconds,
  activeExerciseTimer,
  now,
  restDurationSeconds,
  restRemainingSeconds,
  saveStatus,
  formatMetric,
  formatDuration,
  getSetTypeLabel,
  onSetValueChange,
  onWorkoutStart,
  onWorkoutEnd,
  onExerciseTimerToggle,
  onRestDurationChange,
  onRestStart,
  onRestReset,
  onSave,
  onCopyPrevious,
  onClearWeek
}: WorkoutScreenProps) {
  return (
    <div className="screen" key="workout">
      {/* Timers */}
      <div className="timer-grid">
        <div className="timer-card">
          <span className="timer-card__label">Treino</span>
          <strong className="timer-card__time">
            {workoutStartedAt ? formatDuration(workoutElapsedSeconds) : '00:00'}
          </strong>
          <div className="timer-card__actions">
            <button className="btn btn--primary btn--sm" type="button" onClick={onWorkoutStart}>
              Iniciar
            </button>
            <button
              className="btn btn--secondary btn--sm"
              type="button"
              disabled={!workoutStartedAt || Boolean(workoutEndedAt)}
              onClick={onWorkoutEnd}
            >
              Fim
            </button>
          </div>
        </div>

        <div className="timer-card timer-card--rest">
          <span className="timer-card__label">Descanso</span>
          <strong className="timer-card__time">{formatDuration(restRemainingSeconds)}</strong>
          <div className="rest-presets">
            {[60, 90, 120].map((s) => (
              <button
                key={s}
                className={`preset-chip${s === restDurationSeconds ? ' preset-chip--active' : ''}`}
                type="button"
                onClick={() => onRestDurationChange(s)}
              >
                {s}s
              </button>
            ))}
          </div>
          <div className="timer-card__actions">
            <button className="btn btn--primary btn--sm" type="button" onClick={onRestStart}>
              Descansar
            </button>
            <button className="btn btn--secondary btn--sm" type="button" onClick={onRestReset}>
              Zerar
            </button>
          </div>
        </div>
      </div>

      {/* Ações rápidas */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button
          className="btn btn--primary btn--sm"
          style={{ flex: '1 1 auto' }}
          disabled={saveStatus === 'saving'}
          type="button"
          onClick={onSave}
        >
          {saveStatus === 'saving' ? 'Salvando...' : 'Salvar'}
        </button>
        <button
          className="btn btn--secondary btn--sm"
          style={{ flex: '1 1 auto' }}
          disabled={appState.activeWeekIndex === 0}
          type="button"
          onClick={onCopyPrevious}
        >
          Copiar anterior
        </button>
        <button
          className="btn btn--ghost btn--sm"
          style={{ flex: '1 1 auto' }}
          type="button"
          onClick={onClearWeek}
        >
          Limpar semana
        </button>
      </div>

      {/* Exercícios */}
      <div>
        <p className="section-label">Séries</p>
        <div className="section-title">
          <h2>Carga, repetições e histórico</h2>
        </div>
      </div>

      <div className="exercise-list">
        {activeEntries.map(({ template, log }) => {
          if (!log) return null;

          const exerciseElapsedSeconds =
            activeExerciseTimer?.exerciseId === template.id
              ? Math.floor((now - activeExerciseTimer.startedAt) / 1000)
              : 0;

          return (
            <article key={template.id} className="exercise-card">
              <div className="exercise-card__header">
                <div>
                  <h3>{template.name}</h3>
                  <p>
                    {formatMetric(log.summary.totalLoad, 0)} kg · {formatMetric(log.summary.averageReps)} reps
                  </p>
                </div>
                <div className="exercise-actions">
                  <button
                    className="btn btn--secondary btn--sm"
                    type="button"
                    onClick={() => onExerciseTimerToggle(template.id)}
                  >
                    {activeExerciseTimer?.exerciseId === template.id
                      ? `Fim ${formatDuration(exerciseElapsedSeconds)}`
                      : 'Iniciar'}
                  </button>
                  {template.videoUrl ? (
                    <a className="video-link" href={template.videoUrl} rel="noreferrer" target="_blank">
                      Vídeo
                    </a>
                  ) : null}
                </div>
              </div>

              <div className="set-grid">
                {log.sets.map((setEntry) => (
                  <div
                    key={`${template.id}-${setEntry.slotIndex}`}
                    className={`set-card set-card--${setEntry.type}`}
                  >
                    <span className="set-card__title">
                      Série {setEntry.slotIndex + 1} · {getSetTypeLabel(setEntry.type)}
                    </span>
                    <label>
                      <span>Kg</span>
                      <input
                        inputMode="decimal"
                        placeholder="0"
                        value={setEntry.load}
                        onChange={(e) =>
                          onSetValueChange(template.id, setEntry.slotIndex, 'load', e.target.value)
                        }
                      />
                    </label>
                    <label>
                      <span>Reps</span>
                      <input
                        inputMode="decimal"
                        placeholder="0"
                        value={setEntry.reps}
                        onChange={(e) =>
                          onSetValueChange(template.id, setEntry.slotIndex, 'reps', e.target.value)
                        }
                      />
                    </label>
                  </div>
                ))}
              </div>

              <div className="history-strip" aria-label={`Histórico de ${template.name}`}>
                {appState.weeks.map((week) => {
                  const workoutLog = week.workoutLogs.find((entry) => entry.workoutId === activeWorkout.id);
                  const exerciseLog = workoutLog?.exerciseLogs.find(
                    (entry) => entry.exerciseId === template.id
                  );
                  const completedSets =
                    exerciseLog?.sets.filter((s) => s.load || s.reps) ?? [];

                  return (
                    <div key={`${template.id}-${week.index}`} className="history-chip">
                      <strong>S{week.index + 1}</strong>
                      <span>{formatMetric(exerciseLog?.summary.totalLoad ?? null, 0)} kg</span>
                      <small>
                        {completedSets.length
                          ? completedSets
                              .map((s) => `${s.load || '-'}x${s.reps || '-'}`)
                              .join(' / ')
                          : '-'}
                      </small>
                    </div>
                  );
                })}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}

export default WorkoutScreen;
