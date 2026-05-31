import { useEffect, useMemo, useRef, useState } from 'react';
import PinGate from './components/PinGate';
import WorkbookSheet from './components/WorkbookSheet';
import { APP_NAME, SESSION_UNLOCK_KEY, STATIC_PIN } from './config';
import { createSeedAppState } from './data/seedData';
import sheetLayout from './data/sheetLayout.json';
import { loadAppState, saveAppState } from './lib/db';
import {
  calculateSummaryFromSets,
  createEmptySetEntries,
  formatMetric,
  getWeekSummary,
  getWorkoutSummary,
  isAppState,
  sanitizeNumericInput
} from './lib/state';
import { buildSheetDisplayValues, exportWorkbookFile, exportWorkbookPdf } from './lib/workbook';
import type { AppState, SheetLayout } from './types';

const workbookLayout = sheetLayout as SheetLayout;

function App() {
  const [appState, setAppState] = useState<AppState | null>(null);
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [pinValue, setPinValue] = useState('');
  const [pinError, setPinError] = useState('');
  const [flashMessage, setFlashMessage] = useState('');
  const [isExportingWorkbook, setIsExportingWorkbook] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const pdfSheetRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let isMounted = true;

    setIsUnlocked(sessionStorage.getItem(SESSION_UNLOCK_KEY) === 'true');

    void loadAppState().then((savedState) => {
      if (!isMounted) {
        return;
      }

      const nextState = savedState && isAppState(savedState) ? savedState : createSeedAppState();

      setAppState(nextState);

      if (!savedState || !isAppState(savedState)) {
        void saveAppState(nextState);
      }
    });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!appState) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      void saveAppState(appState);
    }, 180);

    return () => window.clearTimeout(timeoutId);
  }, [appState]);

  useEffect(() => {
    if (!flashMessage) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      setFlashMessage('');
    }, 2600);

    return () => window.clearTimeout(timeoutId);
  }, [flashMessage]);

  const workbookCellValues = useMemo(
    () => (appState ? buildSheetDisplayValues(appState, workbookLayout, appState.activeWeekIndex) : {}),
    [appState]
  );

  const updateState = (updater: (currentState: AppState) => AppState) => {
    setAppState((currentState) => (currentState ? updater(currentState) : currentState));
  };

  if (!appState) {
    return (
      <main className="app-shell">
        <section className="loading-card">
          <p className="pin-brand">{APP_NAME}</p>
          <h1>Carregando planilha...</h1>
        </section>
      </main>
    );
  }

  if (!isUnlocked) {
    return (
      <PinGate
        errorMessage={pinError}
        pinValue={pinValue}
        onPinChange={(value) => {
          setPinValue(value);
          setPinError('');
        }}
        onSubmit={(event) => {
          event.preventDefault();

          if (pinValue === STATIC_PIN) {
            sessionStorage.setItem(SESSION_UNLOCK_KEY, 'true');
            setIsUnlocked(true);
            setPinValue('');
            setPinError('');
            return;
          }

          setPinError('PIN incorreto.');
        }}
      />
    );
  }

  const activeWeek = appState.weeks[appState.activeWeekIndex] ?? appState.weeks[0];
  const activeWorkout =
    appState.templates.find((workout) => workout.id === appState.activeWorkoutId) ?? appState.templates[0];
  const activeWorkoutLog =
    activeWeek.workoutLogs.find((workoutLog) => workoutLog.workoutId === activeWorkout.id) ??
    activeWeek.workoutLogs[0];
  const activeWeekSummary = getWeekSummary(activeWeek);
  const activeWorkoutSummary = getWorkoutSummary(activeWorkoutLog);
  const activeEntries = activeWorkout.exercises.map((exercise) => ({
    template: exercise,
    log: activeWorkoutLog.exerciseLogs.find((entry) => entry.exerciseId === exercise.id)
  }));

  const updateSetValue = (
    exerciseId: string,
    slotIndex: number,
    field: 'load' | 'reps',
    value: string
  ) => {
    const sanitizedValue = sanitizeNumericInput(value);

    updateState((currentState) => ({
      ...currentState,
      weeks: currentState.weeks.map((week) => {
        if (week.index !== currentState.activeWeekIndex) {
          return week;
        }

        return {
          ...week,
          workoutLogs: week.workoutLogs.map((workoutLog) => {
            if (workoutLog.workoutId !== currentState.activeWorkoutId) {
              return workoutLog;
            }

            return {
              ...workoutLog,
              exerciseLogs: workoutLog.exerciseLogs.map((exerciseLog) => {
                if (exerciseLog.exerciseId !== exerciseId) {
                  return exerciseLog;
                }

                const nextSets = exerciseLog.sets.map((setEntry) =>
                  setEntry.slotIndex === slotIndex ? { ...setEntry, [field]: sanitizedValue } : setEntry
                );

                return {
                  ...exerciseLog,
                  sets: nextSets,
                  summary: calculateSummaryFromSets({ sets: nextSets })
                };
              })
            };
          })
        };
      })
    }));
  };

  const handleCopyPreviousWeek = () => {
    if (appState.activeWeekIndex === 0) {
      return;
    }

    updateState((currentState) => ({
      ...currentState,
      weeks: currentState.weeks.map((week) =>
        week.index === currentState.activeWeekIndex
          ? {
              ...week,
              workoutLogs: structuredClone(currentState.weeks[currentState.activeWeekIndex - 1].workoutLogs)
            }
          : week
      )
    }));

    setFlashMessage('Semana anterior copiada.');
  };

  const handleClearWeek = () => {
    updateState((currentState) => ({
      ...currentState,
      weeks: currentState.weeks.map((week) =>
        week.index === currentState.activeWeekIndex
          ? {
              ...week,
              workoutLogs: week.workoutLogs.map((workoutLog) => {
                const workoutTemplate = currentState.templates.find(
                  (template) => template.id === workoutLog.workoutId
                );

                return {
                  ...workoutLog,
                  exerciseLogs: workoutLog.exerciseLogs.map((exerciseLog) => {
                    const exerciseTemplate = workoutTemplate?.exercises.find(
                      (exercise) => exercise.id === exerciseLog.exerciseId
                    );

                    return {
                      ...exerciseLog,
                      sets: exerciseTemplate ? createEmptySetEntries(exerciseTemplate) : exerciseLog.sets,
                      summary: {
                        totalLoad: null,
                        averageReps: null,
                        setCount: 0
                      }
                    };
                  })
                };
              })
            }
          : week
      )
    }));

    setFlashMessage('Semana atual zerada.');
  };

  const handleExportWorkbook = async () => {
    setIsExportingWorkbook(true);

    try {
      await exportWorkbookFile(appState, appState.activeWeekIndex);
      setFlashMessage('Planilha exportada em Excel.');
    } catch {
      setFlashMessage('Nao foi possivel exportar o Excel.');
    } finally {
      setIsExportingWorkbook(false);
    }
  };

  const handleExportPdf = async () => {
    if (!pdfSheetRef.current) {
      return;
    }

    setIsExportingPdf(true);

    try {
      await exportWorkbookPdf(pdfSheetRef.current, appState.activeWeekIndex);
      setFlashMessage('Planilha exportada em PDF.');
    } catch {
      setFlashMessage('Nao foi possivel exportar o PDF.');
    } finally {
      setIsExportingPdf(false);
    }
  };

  const handleLock = () => {
    sessionStorage.removeItem(SESSION_UNLOCK_KEY);
    setIsUnlocked(false);
    setPinValue('');
    setPinError('');
  };

  return (
    <main className="app-shell app-shell--workbook">
      <header className="toolbar">
        <div className="toolbar__copy">
          <p className="pin-brand">{APP_NAME}</p>
          <h1>{activeWeek.label}</h1>
          <p>
            {formatMetric(activeWeekSummary.totalLoad, 0)} kg total · {formatMetric(activeWeekSummary.averageReps)} reps
          </p>
        </div>

        <div className="toolbar__actions">
          <button
            className="button button--secondary"
            disabled={appState.activeWeekIndex === 0}
            type="button"
            onClick={handleCopyPreviousWeek}
          >
            Copiar anterior
          </button>
          <button className="button button--secondary" type="button" onClick={handleClearWeek}>
            Limpar semana
          </button>
          <button
            className="button button--secondary"
            disabled={isExportingWorkbook}
            type="button"
            onClick={() => {
              void handleExportWorkbook();
            }}
          >
            {isExportingWorkbook ? 'Gerando Excel...' : 'Excel'}
          </button>
          <button
            className="button button--secondary"
            disabled={isExportingPdf}
            type="button"
            onClick={() => {
              void handleExportPdf();
            }}
          >
            {isExportingPdf ? 'Gerando PDF...' : 'PDF'}
          </button>
          <button className="button button--ghost" type="button" onClick={handleLock}>
            Travar
          </button>
        </div>
      </header>

      {flashMessage ? <div className="toast">{flashMessage}</div> : null}

      <section className="week-strip" aria-label="Semanas">
        {appState.weeks.map((week) => {
          const summary = getWeekSummary(week);

          return (
            <button
              key={week.index}
              className={`week-chip${week.index === appState.activeWeekIndex ? ' week-chip--active' : ''}`}
              type="button"
              onClick={() => {
                updateState((currentState) => ({
                  ...currentState,
                  activeWeekIndex: week.index
                }));
              }}
            >
              <strong>{week.label}</strong>
              <span>{formatMetric(summary.totalLoad, 0)} kg</span>
            </button>
          );
        })}
      </section>

      <section className="workout-strip" aria-label="Treinos">
        {appState.templates.map((workout) => (
          <button
            key={workout.id}
            className={`workout-chip${workout.id === activeWorkout.id ? ' workout-chip--active' : ''}`}
            style={{ ['--workout-accent' as string]: workout.accent }}
            type="button"
            onClick={() => {
              updateState((currentState) => ({
                ...currentState,
                activeWorkoutId: workout.id
              }));
            }}
          >
            <strong>{workout.name}</strong>
            <span>{workout.subtitle}</span>
          </button>
        ))}
      </section>

      <section className="workout-summary-card">
        <div>
          <p className="section-label">Treino ativo</p>
          <h2>{activeWorkout.name}</h2>
        </div>
        <div className="summary-line">
          <span>{formatMetric(activeWorkoutSummary.totalLoad, 0)} kg</span>
          <span>{formatMetric(activeWorkoutSummary.averageReps)} reps</span>
        </div>
      </section>

      <section className="exercise-stack">
        {activeEntries.map(({ template, log }) => {
          if (!log) {
            return null;
          }

          return (
            <article key={template.id} className="exercise-card">
              <div className="exercise-card__header">
                <div>
                  <h3>{template.name}</h3>
                  <p>
                    {template.orangeSetCount} laranja · {template.redSetCount} vermelha
                  </p>
                </div>
                {template.videoUrl ? (
                  <a className="video-link" href={template.videoUrl} rel="noreferrer" target="_blank">
                    Video
                  </a>
                ) : null}
              </div>

              <div className="exercise-card__summary">
                <span>Carga {formatMetric(log.summary.totalLoad, 0)} kg</span>
                <span>Media {formatMetric(log.summary.averageReps)} reps</span>
              </div>

              <div className="set-grid">
                {log.sets.map((setEntry) => (
                  <div
                    key={`${template.id}-${setEntry.slotIndex}`}
                    className={`set-card set-card--${setEntry.type}`}
                  >
                    <span className="set-card__title">Serie {setEntry.slotIndex + 1}</span>
                    <label>
                      <span>Kg</span>
                      <input
                        inputMode="decimal"
                        placeholder="0"
                        value={setEntry.load}
                        onChange={(event) =>
                          updateSetValue(template.id, setEntry.slotIndex, 'load', event.target.value)
                        }
                      />
                    </label>
                    <label>
                      <span>Reps</span>
                      <input
                        inputMode="decimal"
                        placeholder="0"
                        value={setEntry.reps}
                        onChange={(event) =>
                          updateSetValue(template.id, setEntry.slotIndex, 'reps', event.target.value)
                        }
                      />
                    </label>
                  </div>
                ))}
              </div>
            </article>
          );
        })}
      </section>

      <div className="sheet-capture-surface" aria-hidden="true">
        <div ref={pdfSheetRef} className="sheet-capture-frame">
          <WorkbookSheet cellValues={workbookCellValues} layout={workbookLayout} />
        </div>
      </div>
    </main>
  );
}

export default App;