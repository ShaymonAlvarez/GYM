import { useState, useMemo } from 'react';
import type { AppState, ExerciseTemplate, ExerciseLog, SummaryMetrics, WorkoutSession } from '../types';
import CustomSelect from './CustomSelect';
import ScrollPicker from './ScrollPicker';

// ── Icons ──────────────────────────────────────────────────────────────────

const SaveIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
    <polyline points="17 21 17 13 7 13 7 21"/>
    <polyline points="7 3 7 8 15 8"/>
  </svg>
);

const CopyIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
  </svg>
);

const TrashIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6"/>
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
  </svg>
);

const ResetIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18"/>
    <line x1="6" y1="6" x2="18" y2="18"/>
  </svg>
);

const PlayIcon = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" stroke="none">
    <polygon points="5 3 19 12 5 21 5 3"/>
  </svg>
);

const PauseIcon = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" stroke="none">
    <rect x="6" y="4" width="4" height="16"/>
    <rect x="14" y="4" width="4" height="16"/>
  </svg>
);

const ClockIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="9"/>
    <polyline points="12 7 12 12 15.5 14"/>
  </svg>
);

const ChevronDownIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="6 9 12 15 18 9"/>
  </svg>
);

// ── Helpers ────────────────────────────────────────────────────────────────

function parseRestRange(restStr: string): [number, number] {
  const nums = restStr.match(/\d+/g)?.map((n) => parseInt(n, 10)) ?? [];
  if (nums.length >= 2) return [nums[0] * 60, nums[1] * 60];
  if (nums.length === 1) return [nums[0] * 60, nums[0] * 60 + 60];
  return [60, 120];
}

function getRestOptions(template: ExerciseTemplate, current: number): number[] {
  const restStr =
    template.setDetails?.red?.rest ??
    template.setDetails?.orange?.rest ??
    template.restInterval;

  let min: number;
  let max: number;
  if (!restStr) {
    [min, max] = [60, 120];
  } else {
    [min, max] = parseRestRange(restStr);
  }

  // Snap to 30s grid: floor the minimum, ceil the maximum
  min = Math.max(30, Math.floor(min / 30) * 30);
  max = Math.max(min, Math.ceil(max / 30) * 30);

  const options: number[] = [];
  for (let s = min; s <= max; s += 30) {
    options.push(s);
  }

  // Always keep the currently selected value selectable
  if (!options.includes(current)) {
    options.push(current);
    options.sort((a, b) => a - b);
  }

  return options;
}

function formatRestLabel(s: number): string {
  if (s >= 60 && s % 60 === 0) return `${s / 60}min`;
  if (s >= 60) return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  return `${s}s`;
}

// ── Mini Calendar ─────────────────────────────────────────────────────────

const MONTHS_PT = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const DOWS_PT   = ['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'];

function MiniCalendar({
  sessions,
  onEdit,
  onReset,
}: {
  sessions: WorkoutSession[];
  onEdit: (date: string, durationSeconds: number) => void;
  onReset: () => void;
}) {
  const todayIso = new Date().toISOString().slice(0, 10);
  const todayDate = new Date();
  const [viewYear,  setViewYear]  = useState(todayDate.getFullYear());
  const [viewMonth, setViewMonth] = useState(todayDate.getMonth());
  const [editingDate, setEditingDate] = useState<string | null>(null);
  const [editMinutes, setEditMinutes] = useState('');

  const sessionMap = useMemo(
    () => new Map(sessions.map((s) => [s.date, s])),
    [sessions]
  );

  const daysInMonth  = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstDow     = new Date(viewYear, viewMonth, 1).getDay(); // 0=Sun
  const startOffset  = (firstDow + 6) % 7; // Mon = 0

  const todaySession = sessionMap.get(todayIso);

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear((y) => y - 1); }
    else setViewMonth((m) => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear((y) => y + 1); }
    else setViewMonth((m) => m + 1);
  };

  const startEdit = (date: string) => {
    const s = sessionMap.get(date);
    setEditingDate(date);
    setEditMinutes(s ? String(Math.round(s.durationSeconds / 60)) : '0');
  };

  const confirmEdit = () => {
    if (!editingDate) return;
    const mins = Math.max(0, parseInt(editMinutes, 10) || 0);
    onEdit(editingDate, mins * 60);
    setEditingDate(null);
  };

  return (
    <div className="training-calendar">
      <div className="training-calendar__nav">
        <button type="button" className="training-calendar__nav-btn" onClick={prevMonth}>‹</button>
        <span className="training-calendar__month">{MONTHS_PT[viewMonth]} {viewYear}</span>
        <button type="button" className="training-calendar__nav-btn" onClick={nextMonth}>›</button>
      </div>

      <div className="training-calendar__grid">
        {DOWS_PT.map((d) => (
          <div key={d} className="training-calendar__dow">{d}</div>
        ))}
        {Array.from({ length: startOffset }, (_, i) => (
          <div key={`e${i}`} className="training-calendar__cell training-calendar__cell--empty" />
        ))}
        {Array.from({ length: daysInMonth }, (_, i) => {
          const day = i + 1;
          const iso = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const session = sessionMap.get(iso);
          const isToday = iso === todayIso;
          return (
            <div
              key={day}
              className={[
                'training-calendar__cell',
                isToday     ? 'training-calendar__cell--today'       : '',
                session     ? 'training-calendar__cell--has-session'  : '',
              ].filter(Boolean).join(' ')}
            >
              <span className="training-calendar__day-num">{day}</span>
              {session && (
                <button
                  type="button"
                  className="training-calendar__badge"
                  onClick={() => startEdit(iso)}
                  title="Clique para editar"
                >
                  {Math.round(session.durationSeconds / 60)}m
                </button>
              )}
            </div>
          );
        })}
      </div>

      <div className="training-calendar__footer">
        <span className="training-calendar__footer-label">Hoje:</span>
        {editingDate === todayIso ? (
          <div className="training-calendar__edit-row">
            <input
              className="training-calendar__edit-input"
              type="number"
              min="0"
              max="999"
              value={editMinutes}
              onChange={(e) => setEditMinutes(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && confirmEdit()}
              autoFocus
            />
            <span>min</span>
            <button type="button" className="btn btn--primary btn--sm" onClick={confirmEdit}>Salvar</button>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => setEditingDate(null)}>×</button>
          </div>
        ) : (
          <div className="training-calendar__edit-row">
            <span className="training-calendar__footer-value">
              {todaySession ? `${Math.round(todaySession.durationSeconds / 60)} min` : '—'}
            </span>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => startEdit(todayIso)}>
              Editar
            </button>
            <button type="button" className="btn btn--ghost btn--sm" onClick={onReset} title="Limpar e reiniciar o cronômetro de hoje">
              ↺ Reiniciar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Types ──────────────────────────────────────────────────────────────────

type WorkoutScreenProps = {
  appState: AppState;
  activeEntries: Array<{ template: ExerciseTemplate; log: ExerciseLog | undefined }>;
  activeWorkout: AppState['templates'][number];
  workoutStartedAt: number | null;
  workoutEndedAt: number | null;
  workoutTimerPaused: boolean;
  workoutElapsedSeconds: number;
  activeSetTimer: { exerciseId: string; slotIndex: number; startedAt: number; accumulated: number; paused: boolean } | null;
  restTimer: { exerciseId: string; slotIndex: number; startedAt: number; duration: number } | null;
  now: number;
  restDurationSeconds: number;
  restRemainingSeconds: number;
  saveStatus: 'saved' | 'saving' | 'dirty';
  formatMetric: (value: number | null, maxFractionDigits?: number) => string;
  formatDuration: (seconds: number) => string;
  getWeekSummary: (week: AppState['weeks'][number]) => SummaryMetrics;
  workoutSessions: WorkoutSession[];
  onSetValueChange: (exerciseId: string, slotIndex: number, field: 'load' | 'reps', value: string) => void;
  onWorkoutStart: () => void;
  onWorkoutEnd: () => void;
  onWorkoutPauseToggle: () => void;
  onEditSession: (date: string, durationSeconds: number) => void;
  onResetTimer: () => void;
  onSetTimerToggle: (exerciseId: string, slotIndex: number) => void;
  onFinalizeSet: (exerciseId: string, slotIndex: number) => void;
  onClearSet: (exerciseId: string, slotIndex: number) => void;
  onRestDurationChange: (seconds: number) => void;
  onFinishRest: () => void;
  onSave: () => void;
  onCopyPrevious: () => void;
  onClearWeek: () => void;
  onClearExercise: (exerciseId: string) => void;
  onClearExerciseForWeek: (exerciseId: string, weekIndex: number) => void;
  onWeekChange: (weekIndex: number) => void;
  onWorkoutChange: (workoutId: string) => void;
};

// ── Component ──────────────────────────────────────────────────────────────

function WorkoutScreen({
  appState,
  activeEntries,
  activeWorkout,
  workoutStartedAt,
  workoutEndedAt,
  workoutTimerPaused,
  workoutElapsedSeconds,
  activeSetTimer,
  restTimer,
  now,
  restDurationSeconds,
  restRemainingSeconds,
  saveStatus,
  formatMetric,
  formatDuration,
  getWeekSummary,
  onSetValueChange,
  workoutSessions,
  onWorkoutStart,
  onWorkoutEnd,
  onWorkoutPauseToggle,
  onEditSession,
  onResetTimer,
  onSetTimerToggle,
  onFinalizeSet,
  onClearSet,
  onRestDurationChange,
  onFinishRest,
  onSave,
  onCopyPrevious,
  onClearWeek,
  onClearExercise,
  onClearExerciseForWeek,
  onWeekChange,
  onWorkoutChange
}: WorkoutScreenProps) {
  const [expandedExercises, setExpandedExercises] = useState<Record<string, boolean>>({});
  const [restPickerExerciseId, setRestPickerExerciseId] = useState<string | null>(null);
  const [repsPickerFor, setRepsPickerFor] = useState<{ exerciseId: string; slotIndex: number } | null>(null);
  const [calendarOpen, setCalendarOpen] = useState(false);

  const toggleExercise = (id: string, event: React.MouseEvent) => {
    if ((event.target as HTMLElement).closest('button') || (event.target as HTMLElement).closest('a')) {
      return;
    }
    setExpandedExercises((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const setElapsedSeconds = activeSetTimer
    ? activeSetTimer.paused
      ? activeSetTimer.accumulated
      : activeSetTimer.accumulated + Math.floor((now - activeSetTimer.startedAt) / 1000)
    : 0;

  return (
    <div className="screen" key="workout">

      {/* HEADER FIXO DO TREINO */}
      <div className="workout-sticky-header">
        <div className="workout-sticky-header__row">
          <button
            type="button"
            className="workout-sticky-header__info workout-sticky-header__info--clickable"
            onClick={() => setCalendarOpen((v) => !v)}
            aria-expanded={calendarOpen}
          >
            <span className="workout-sticky-header__label">
              {workoutTimerPaused ? 'Pausado' : 'Tempo de Treino'}
              <span className="workout-sticky-header__chevron">{calendarOpen ? ' ▲' : ' ▼'}</span>
            </span>
            <span className={`workout-sticky-header__time${workoutTimerPaused ? ' workout-sticky-header__time--paused' : ''}`}>
              {workoutStartedAt ? formatDuration(workoutElapsedSeconds) : '00:00'}
            </span>
          </button>
          <div className="workout-sticky-header__controls">
            {!workoutStartedAt ? (
              <button className="btn btn--primary btn--sm" type="button" onClick={onWorkoutStart}>
                Iniciar
              </button>
            ) : workoutEndedAt ? (
              <span className="workout-timer-done">Concluído ✓</span>
            ) : (
              <>
                <button className="btn btn--ghost btn--sm" type="button" onClick={onWorkoutPauseToggle}>
                  {workoutTimerPaused ? '▶ Retomar' : '⏸ Pausar'}
                </button>
                <button className="btn btn--secondary btn--sm" type="button" onClick={onWorkoutEnd}>
                  Finalizar
                </button>
              </>
            )}
          </div>
        </div>
        {calendarOpen && (
          <div className="workout-calendar-panel">
            <MiniCalendar
              sessions={workoutSessions}
              onEdit={onEditSession}
              onReset={onResetTimer}
            />
          </div>
        )}
      </div>

      {/* SELETORES */}
      <div className="workout-selectors">

        {/* Semana: dropdown */}
        <CustomSelect
          value={String(appState.activeWeekIndex)}
          onChange={(val) => onWeekChange(Number(val))}
          options={appState.weeks.map((week) => {
            const summary = getWeekSummary(week);
            const kg = formatMetric(summary.totalLoad, 0);
            return {
              value: String(week.index),
              label: week.label + (summary.totalLoad ? ` — ${kg} kg` : '')
            };
          })}
        />

        {/* Treino: letras compactas */}
        <div className="workout-letter-strip">
          {appState.templates.map((workout) => (
            <button
              key={workout.id}
              className={`workout-letter-btn${workout.id === activeWorkout.id ? ' workout-letter-btn--active' : ''}`}
              style={{ ['--wa' as string]: workout.accent }}
              type="button"
              title={workout.subtitle}
              onClick={() => onWorkoutChange(workout.id)}
            >
              {workout.name.replace('Treino ', '')}
            </button>
          ))}
        </div>

        {/* Legenda de cores */}
        <div className="legend-row">
          <span className="legend-pill legend-pill--yellow">Aquecimento</span>
          <span className="legend-pill legend-pill--orange">Série séria</span>
          <span className="legend-pill legend-pill--red">Série difícil</span>
        </div>
      </div>

      {/* Ações rápidas */}
      <div className="workout-actions-bar">
        <button
          className="action-btn action-btn--primary"
          disabled={saveStatus === 'saving'}
          type="button"
          title={saveStatus === 'saving' ? 'Salvando...' : 'Salvar'}
          onClick={onSave}
        >
          <SaveIcon />
          <span>{saveStatus === 'saving' ? 'Salvando…' : 'Salvar'}</span>
        </button>
        <button
          className="action-btn"
          disabled={appState.activeWeekIndex === 0}
          type="button"
          title="Copiar cargas da semana anterior"
          onClick={onCopyPrevious}
        >
          <CopyIcon />
          <span>Anterior</span>
        </button>
        <button
          className="action-btn action-btn--ghost"
          type="button"
          title="Limpar toda a semana"
          onClick={onClearWeek}
        >
          <TrashIcon />
        </button>
      </div>

      {/* Exercícios */}
      <div className="exercise-list" style={{ ['--workout-accent' as string]: activeWorkout.accent }}>
        {activeEntries.map(({ template, log }) => {
          if (!log) return null;

          const isExpanded = expandedExercises[template.id] ?? false;

          return (
            <article key={template.id} className="exercise-card">
              <div
                className="exercise-card__header"
                onClick={(e) => toggleExercise(template.id, e)}
                style={{ cursor: 'pointer' }}
              >
                <div>
                  <h3>
                    {template.name}
                    <span style={{ fontSize: '0.8em', marginLeft: '8px', opacity: 0.6 }}>
                      {isExpanded ? '▼' : '▶'}
                    </span>
                  </h3>
                  <p>
                    {formatMetric(log.summary.totalLoad, 0)} kg · {formatMetric(log.summary.averageReps)} reps
                  </p>
                  {!template.setDetails && (template.expectedReps || template.restInterval || template.rir) && (
                    <div className="exercise-pills">
                      {template.expectedReps && <span className="pill">{template.expectedReps} reps</span>}
                      {template.restInterval && <span className="pill">{template.restInterval} desc</span>}
                      {template.rir && <span className="pill">RIR {template.rir}</span>}
                    </div>
                  )}
                  {template.pdfNotes && (
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginTop: '4px', fontStyle: 'italic' }}>
                      {template.pdfNotes}
                    </p>
                  )}
                </div>
                <div className="exercise-actions">
                  <button
                    className="exercise-reset-btn"
                    type="button"
                    title="Zerar este exercício"
                    onClick={() => onClearExercise(template.id)}
                  >
                    <ResetIcon />
                  </button>
                  {template.videoUrl ? (
                    <a className="video-link" href={template.videoUrl} rel="noreferrer" target="_blank">
                      Vídeo
                    </a>
                  ) : null}
                </div>
              </div>

              {isExpanded && (
                <>
                  {/* LISTA DE SÉRIES */}
                  <div className="set-list">
                    {log.sets.map((setEntry) => {
                      if (appState.preferences?.hideWarmupSets && setEntry.type === 'yellow') {
                        return null;
                      }

                      const isThisSetActive =
                        activeSetTimer?.exerciseId === template.id &&
                        activeSetTimer?.slotIndex === setEntry.slotIndex;
                      const isThisSetPaused = isThisSetActive && activeSetTimer?.paused;
                      const isThisSetResting =
                        restTimer?.exerciseId === template.id &&
                        restTimer?.slotIndex === setEntry.slotIndex;

                      const details = template.setDetails?.[setEntry.type];

                      return (
                        <div
                          key={`${template.id}-${setEntry.slotIndex}`}
                          className={`set-row set-row--${setEntry.type}${(isThisSetActive && !isThisSetPaused) || isThisSetResting ? ' set-row--active' : ''}`}
                        >
                          {details && (
                            <div className="set-row__target">
                              <span>{details.reps} reps</span>
                              <span>{details.rest}</span>
                              <span>RIR {details.rir}</span>
                            </div>
                          )}

                          <div className="set-row__action">
                            <label className="set-field">
                              <span className="set-field__label">Kg</span>
                              <input
                                className="set-field__input"
                                inputMode="decimal"
                                placeholder="0"
                                value={setEntry.load}
                                onChange={(e) =>
                                  onSetValueChange(template.id, setEntry.slotIndex, 'load', e.target.value)
                                }
                              />
                            </label>
                            <button
                              type="button"
                              className="set-field set-field--btn"
                              onClick={() => setRepsPickerFor({ exerciseId: template.id, slotIndex: setEntry.slotIndex })}
                            >
                              <span className="set-field__label">Reps</span>
                              <span className="set-field__value">{setEntry.reps || '0'}</span>
                            </button>
                            <div className="set-row__tools">
                              <button
                                className={`set-timer-btn${isThisSetActive && !isThisSetPaused ? ' set-timer-btn--running' : ''}${isThisSetPaused ? ' set-timer-btn--paused' : ''}${isThisSetResting ? ' set-timer-btn--resting' : ''}`}
                                type="button"
                                title={isThisSetResting ? 'Finalizar descanso' : isThisSetActive && !isThisSetPaused ? 'Pausar série' : isThisSetPaused ? 'Retomar série' : 'Iniciar série'}
                                onClick={() =>
                                  isThisSetResting
                                    ? onFinishRest()
                                    : onSetTimerToggle(template.id, setEntry.slotIndex)
                                }
                              >
                                {isThisSetResting ? (
                                  <span style={{ fontSize: '1rem', lineHeight: 1 }}>💤</span>
                                ) : isThisSetActive && !isThisSetPaused ? (
                                  <PauseIcon />
                                ) : (
                                  <PlayIcon />
                                )}
                              </button>
                              <button
                                className="set-clear-btn"
                                type="button"
                                title="Limpar série"
                                onClick={() => onClearSet(template.id, setEntry.slotIndex)}
                              >
                                <ResetIcon />
                              </button>
                            </div>
                          </div>

                          {setEntry.activeSeconds !== undefined && (
                            <div className="set-row__timing">
                              <span>⏱ {formatDuration(setEntry.activeSeconds)} ativo</span>
                              {setEntry.restSeconds !== undefined && (
                                <span>💤 {formatRestLabel(setEntry.restSeconds)} descanso</span>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* CONTROLES DE DESCANSO */}
                  <div className="exercise-rest-trigger">
                    <span>Descanso:</span>
                    <button
                      type="button"
                      className="rest-trigger-btn"
                      onClick={() => setRestPickerExerciseId(template.id)}
                    >
                      <ClockIcon />
                      <span>{formatRestLabel(restDurationSeconds)}</span>
                      <ChevronDownIcon />
                    </button>
                  </div>

                  {/* HISTÓRICO */}
                  <details className="history-accordion">
                    <summary>Ver histórico completo</summary>
                    <div className="history-accordion-content">
                      <div className="history-strip" aria-label={`Histórico de ${template.name}`}>
                        {appState.weeks.map((week) => {
                          const workoutLog = week.workoutLogs.find((entry) => entry.workoutId === activeWorkout.id);
                          const exerciseLog = workoutLog?.exerciseLogs.find(
                            (entry) => entry.exerciseId === template.id
                          );
                          const completedSets = exerciseLog?.sets.filter((s) => s.load || s.reps || s.activeSeconds !== undefined) ?? [];

                          return (
                            <div key={`${template.id}-${week.index}`} className="history-chip">
                              <div className="history-chip__header">
                                <strong>S{week.index + 1}</strong>
                                {completedSets.length > 0 && (
                                  <button
                                    className="history-chip__clear"
                                    type="button"
                                    title="Limpar semana"
                                    onClick={() => onClearExerciseForWeek(template.id, week.index)}
                                  >
                                    <ResetIcon />
                                  </button>
                                )}
                              </div>
                              <span>{formatMetric(exerciseLog?.summary.totalLoad ?? null, 0)} kg</span>
                              {completedSets.length ? (
                                <div className="history-chip__sets">
                                  {completedSets.map((s, i) => (
                                    <div key={i} className="history-chip__set">
                                      {(s.load || s.reps) && (
                                        <b>{s.load || '-'}×{s.reps || '-'}</b>
                                      )}
                                      {s.activeSeconds !== undefined && (
                                        <span>⏱{formatDuration(s.activeSeconds)}</span>
                                      )}
                                      {s.restSeconds !== undefined && (
                                        <span>💤{formatRestLabel(s.restSeconds)}</span>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <small>—</small>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </details>
                </>
              )}
            </article>
          );
        })}
      </div>

      {/* DYNAMIC ISLAND — SET TIMER (count up) */}
      {activeSetTimer && (
        <div className="dynamic-island dynamic-island--set">
          <div className="dynamic-island__info">
            <div className={`dynamic-island__pulse dynamic-island__pulse--set${activeSetTimer.paused ? ' dynamic-island__pulse--frozen' : ''}`}></div>
            <span className="dynamic-island__time dynamic-island__time--set">{formatDuration(setElapsedSeconds)}</span>
          </div>
          <div className="dynamic-island__actions">
            <button
              className="island-btn island-btn--primary"
              type="button"
              onClick={() => onSetTimerToggle(activeSetTimer.exerciseId, activeSetTimer.slotIndex)}
            >
              {activeSetTimer.paused ? 'Retomar' : 'Pausar'}
            </button>
            <button
              className="island-btn island-btn--secondary"
              type="button"
              onClick={() => onFinalizeSet(activeSetTimer.exerciseId, activeSetTimer.slotIndex)}
            >
              Finalizar
            </button>
          </div>
        </div>
      )}

      {/* DYNAMIC ISLAND — REST TIMER (count down) */}
      {restTimer && restRemainingSeconds > 0 && (
        <div className="dynamic-island">
          <div className="dynamic-island__info">
            <div className="dynamic-island__pulse"></div>
            <span className="dynamic-island__time">{formatDuration(restRemainingSeconds)}</span>
          </div>
          <div className="dynamic-island__actions">
            <button
              className="island-btn island-btn--primary"
              type="button"
              onClick={onFinishRest}
            >
              Finalizar
            </button>
          </div>
        </div>
      )}

      {/* REST PICKER MODAL */}
      {restPickerExerciseId && (() => {
        const pickerTemplate = activeEntries.find((e) => e.template.id === restPickerExerciseId)?.template;
        if (!pickerTemplate) return null;
        const options = getRestOptions(pickerTemplate, restDurationSeconds);
        return (
          <ScrollPicker
            title="Tempo de descanso"
            value={String(restDurationSeconds)}
            options={options.map((s) => ({ value: String(s), label: formatRestLabel(s) }))}
            onChange={(val) => onRestDurationChange(Number(val))}
            onClose={() => setRestPickerExerciseId(null)}
          />
        );
      })()}

      {/* REPS PICKER MODAL */}
      {repsPickerFor && (() => {
        const repsSet = activeEntries
          .find((e) => e.template.id === repsPickerFor.exerciseId)
          ?.log?.sets.find((s) => s.slotIndex === repsPickerFor.slotIndex);
        return (
          <ScrollPicker
            title="Repetições"
            value={repsSet?.reps ?? ''}
            options={Array.from({ length: 20 }, (_, i) => ({ value: String(i + 1), label: String(i + 1) }))}
            onChange={(val) => onSetValueChange(repsPickerFor.exerciseId, repsPickerFor.slotIndex, 'reps', val)}
            onClose={() => setRepsPickerFor(null)}
          />
        );
      })()}
    </div>
  );
}

export default WorkoutScreen;
