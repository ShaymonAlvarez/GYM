import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import PinGate from './components/PinGate';
import { APP_NAME, SESSION_UNLOCK_KEY, STATIC_PIN } from './config';
import { createSeedAppState } from './data/seedData';
import { loadAppState, saveAppState } from './lib/db';
import {
  cloneWeek,
  createBackupPayload,
  createEmptySets,
  formatDateLabel,
  formatMetric,
  getDeltaLabel,
  getDeltaTone,
  getExerciseSummary,
  getWeekSummary,
  getWorkoutSummary,
  nextWeekLabel,
  readImportedState,
  sanitizeNumericInput
} from './lib/state';
import type { AppState } from './types';

const fileToDataUrl = async (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new Error('Nao foi possivel ler a imagem.'));
    reader.readAsDataURL(file);
  });

function App() {
  const [appState, setAppState] = useState<AppState | null>(null);
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [pinValue, setPinValue] = useState('');
  const [pinError, setPinError] = useState('');
  const [flashMessage, setFlashMessage] = useState('');
  const importInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let isMounted = true;

    setIsUnlocked(sessionStorage.getItem(SESSION_UNLOCK_KEY) === 'true');

    void loadAppState().then((savedState) => {
      if (!isMounted) {
        return;
      }

      const nextState = savedState ?? createSeedAppState();

      setAppState(nextState);

      if (!savedState) {
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

  if (!appState) {
    return (
      <main className="app-shell">
        <section className="hero-card">
          <p className="eyebrow">{APP_NAME}</p>
          <h1>Carregando a ficha local...</h1>
          <p className="lead">Preparando treinos, semana ativa e backup local.</p>
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

  const activeWeek = appState.weeks.find((week) => week.id === appState.activeWeekId) ?? appState.weeks[0];
  const activeWorkout =
    appState.templates.find((workout) => workout.id === appState.activeWorkoutId) ?? appState.templates[0];
  const activeWorkoutLog =
    activeWeek.workoutLogs.find((workoutLog) => workoutLog.workoutId === activeWorkout.id) ??
    activeWeek.workoutLogs[0];
  const activeWeekIndex = appState.weeks.findIndex((week) => week.id === activeWeek.id);
  const previousWeek = activeWeekIndex > 0 ? appState.weeks[activeWeekIndex - 1] : null;
  const previousWorkoutLog = previousWeek?.workoutLogs.find(
    (workoutLog) => workoutLog.workoutId === activeWorkout.id
  );
  const activeWorkoutSummary = getWorkoutSummary(activeWorkoutLog);
  const activeWeekSummary = getWeekSummary(activeWeek);
  const totalExerciseCount = new Set(
    appState.templates.flatMap((workout) => workout.exercises.map((exercise) => exercise.id))
  ).size;

  const updateState = (updater: (currentState: AppState) => AppState) => {
    setAppState((currentState) => (currentState ? updater(currentState) : currentState));
  };

  const updateSetValue = (
    exerciseId: string,
    setIndex: number,
    field: 'load' | 'reps',
    value: string
  ) => {
    const sanitizedValue = sanitizeNumericInput(value);

    updateState((currentState) => ({
      ...currentState,
      weeks: currentState.weeks.map((week) => {
        if (week.id !== currentState.activeWeekId) {
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

                return {
                  ...exerciseLog,
                  sets: exerciseLog.sets.map((setEntry, currentIndex) =>
                    currentIndex === setIndex ? { ...setEntry, [field]: sanitizedValue } : setEntry
                  )
                };
              })
            };
          })
        };
      })
    }));
  };

  const updateExerciseNote = (exerciseId: string, note: string) => {
    updateState((currentState) => ({
      ...currentState,
      customizations: {
        ...currentState.customizations,
        [exerciseId]: {
          ...currentState.customizations[exerciseId],
          note
        }
      }
    }));
  };

  const updateExerciseImage = async (exerciseId: string, file: File) => {
    const imageDataUrl = await fileToDataUrl(file);

    updateState((currentState) => ({
      ...currentState,
      customizations: {
        ...currentState.customizations,
        [exerciseId]: {
          ...currentState.customizations[exerciseId],
          imageDataUrl
        }
      }
    }));

    setFlashMessage('Foto salva no aparelho.');
  };

  const removeExerciseImage = (exerciseId: string) => {
    updateState((currentState) => ({
      ...currentState,
      customizations: {
        ...currentState.customizations,
        [exerciseId]: {
          ...currentState.customizations[exerciseId],
          imageDataUrl: undefined
        }
      }
    }));
  };

  const handleNewWeek = () => {
    updateState((currentState) => {
      const currentWeek =
        currentState.weeks.find((week) => week.id === currentState.activeWeekId) ?? currentState.weeks[0];
      const nextWeek = cloneWeek(currentWeek, nextWeekLabel(currentState.weeks));

      return {
        ...currentState,
        weeks: [...currentState.weeks, nextWeek],
        activeWeekId: nextWeek.id
      };
    });

    setFlashMessage('Nova semana criada copiando os valores atuais.');
  };

  const handleResetWorkout = () => {
    updateState((currentState) => ({
      ...currentState,
      weeks: currentState.weeks.map((week) => {
        if (week.id !== currentState.activeWeekId) {
          return week;
        }

        return {
          ...week,
          workoutLogs: week.workoutLogs.map((workoutLog) => {
            if (workoutLog.workoutId !== currentState.activeWorkoutId) {
              return workoutLog;
            }

            const template = currentState.templates.find(
              (currentTemplate) => currentTemplate.id === currentState.activeWorkoutId
            );

            return {
              ...workoutLog,
              exerciseLogs: workoutLog.exerciseLogs.map((exerciseLog) => {
                const exerciseTemplate = template?.exercises.find(
                  (exercise) => exercise.id === exerciseLog.exerciseId
                );

                return {
                  ...exerciseLog,
                  sets: createEmptySets(exerciseTemplate?.setCount ?? exerciseLog.sets.length)
                };
              })
            };
          })
        };
      })
    }));

    setFlashMessage('Treino atual zerado para nova execucao.');
  };

  const handleExport = () => {
    const payload = createBackupPayload(appState);
    const fileName = `gym-local-backup-${new Date().toISOString().slice(0, 10)}.json`;
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    link.href = url;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);
    setFlashMessage('Backup exportado em JSON.');
  };

  const handleImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    try {
      const rawContent = await file.text();
      const parsedContent = JSON.parse(rawContent) as unknown;
      const importedState = readImportedState(parsedContent);

      if (!importedState) {
        throw new Error('Formato invalido.');
      }

      setAppState(importedState);
      setFlashMessage('Backup importado com sucesso.');
    } catch {
      setFlashMessage('Nao foi possivel importar esse arquivo.');
    } finally {
      event.target.value = '';
    }
  };

  const handleImageChange = async (exerciseId: string, event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    try {
      await updateExerciseImage(exerciseId, file);
    } finally {
      event.target.value = '';
    }
  };

  const handleLock = () => {
    sessionStorage.removeItem(SESSION_UNLOCK_KEY);
    setIsUnlocked(false);
    setPinValue('');
    setPinError('');
  };

  const previousWorkoutSummary = previousWorkoutLog ? getWorkoutSummary(previousWorkoutLog) : null;

  return (
    <main className="app-shell app-shell--dashboard">
      <header className="topbar">
        <div className="topbar-copy">
          <p className="eyebrow">{APP_NAME}</p>
          <h1>Ficha local no celular, sem scroll lateral.</h1>
          <p className="lead">
            Semana ativa editavel, copia rapida de semana, PIN simples e backup JSON.
          </p>
        </div>

        <div className="topbar-actions">
          <button className="button button--secondary" type="button" onClick={handleNewWeek}>
            Nova semana
          </button>
          <button className="button button--secondary" type="button" onClick={handleExport}>
            Exportar
          </button>
          <button
            className="button button--secondary"
            type="button"
            onClick={() => importInputRef.current?.click()}
          >
            Importar
          </button>
          <button className="button button--ghost" type="button" onClick={handleLock}>
            Travar
          </button>
          <input
            ref={importInputRef}
            accept="application/json"
            hidden
            type="file"
            onChange={(event) => {
              void handleImport(event);
            }}
          />
        </div>
      </header>

      {flashMessage ? <div className="toast">{flashMessage}</div> : null}

      <section className="overview-grid">
        <article className="overview-card">
          <span className="metric-label">Semana ativa</span>
          <strong className="metric-value">{activeWeek.label}</strong>
          <span className="metric-note">Criada em {formatDateLabel(activeWeek.createdAt)}</span>
        </article>

        <article className="overview-card">
          <span className="metric-label">Carga total</span>
          <strong className="metric-value">{formatMetric(activeWeekSummary.totalLoad, 0)} kg</strong>
          <span className="metric-note">Media {formatMetric(activeWeekSummary.averageReps)} reps</span>
        </article>

        <article className="overview-card">
          <span className="metric-label">Estrutura</span>
          <strong className="metric-value">{appState.templates.length} treinos</strong>
          <span className="metric-note">{totalExerciseCount} exercicios no app</span>
        </article>
      </section>

      <section className="panel week-panel">
        <div className="section-heading-row">
          <div>
            <p className="section-kicker">Semanas</p>
            <h2>Troque de semana com um toque.</h2>
          </div>
          <button className="button button--ghost" type="button" onClick={handleNewWeek}>
            Copiar semana ativa
          </button>
        </div>

        <div className="pill-row">
          {appState.weeks.map((week) => {
            const weekSummary = getWeekSummary(week);

            return (
              <button
                key={week.id}
                className={`pill-button ${week.id === activeWeek.id ? 'pill-button--active' : ''}`}
                type="button"
                onClick={() => {
                  updateState((currentState) => ({
                    ...currentState,
                    activeWeekId: week.id
                  }));
                }}
              >
                <span>{week.label}</span>
                <small>{formatMetric(weekSummary.totalLoad, 0)} kg</small>
              </button>
            );
          })}
        </div>
      </section>

      <section className="workout-tabs">
        {appState.templates.map((workout) => {
          const workoutLog =
            activeWeek.workoutLogs.find((entry) => entry.workoutId === workout.id) ??
            activeWeek.workoutLogs[0];
          const summary = getWorkoutSummary(workoutLog);

          return (
            <button
              key={workout.id}
              className={`workout-tab ${workout.id === activeWorkout.id ? 'workout-tab--active' : ''}`}
              type="button"
              onClick={() => {
                updateState((currentState) => ({
                  ...currentState,
                  activeWorkoutId: workout.id
                }));
              }}
            >
              <span>{workout.name}</span>
              <small>{formatMetric(summary.totalLoad, 0)} kg</small>
            </button>
          );
        })}
      </section>

      <section className="dashboard-grid">
        <div className="panel panel--main">
          <div className="workout-hero">
            <div>
              <p className="section-kicker">{activeWorkout.name}</p>
              <h2>{activeWorkout.subtitle}</h2>
              <p className="workout-hero__copy">
                Ajuste carga e repeticoes sem copiar coluna por coluna. Se quiser, anexe uma foto do
                exercicio no proprio aparelho.
              </p>
            </div>

            <div className="workout-hero__stats">
              <div className="stat-pill">
                <span>Carga</span>
                <strong>{formatMetric(activeWorkoutSummary.totalLoad, 0)} kg</strong>
              </div>
              <div className="stat-pill">
                <span>Media</span>
                <strong>{formatMetric(activeWorkoutSummary.averageReps)} reps</strong>
              </div>
              <button className="button button--ghost" type="button" onClick={handleResetWorkout}>
                Zerar treino
              </button>
            </div>
          </div>

          <div className="exercise-list">
            {activeWorkout.exercises.map((exercise) => {
              const exerciseLog =
                activeWorkoutLog.exerciseLogs.find((entry) => entry.exerciseId === exercise.id) ?? {
                  exerciseId: exercise.id,
                  sets: createEmptySets(exercise.setCount)
                };
              const previousExerciseLog = previousWorkoutLog?.exerciseLogs.find(
                (entry) => entry.exerciseId === exercise.id
              );
              const currentSummary = getExerciseSummary(exerciseLog);
              const previousSummary = previousExerciseLog ? getExerciseSummary(previousExerciseLog) : null;
              const customization = appState.customizations[exercise.id] ?? {};
              const noteValue = customization.note ?? exercise.cue;
              const referenceImage = customization.imageDataUrl ?? exercise.thumbnailUrl;
              const deltaTone = previousSummary
                ? getDeltaTone(currentSummary.totalLoad, previousSummary.totalLoad)
                : 'neutral';

              return (
                <article key={`${activeWorkout.id}-${exercise.id}`} className="exercise-card">
                  <div className="exercise-card__media">
                    {referenceImage ? (
                      <img alt={exercise.name} src={referenceImage} />
                    ) : (
                      <div className="exercise-placeholder">
                        <span>{exercise.focus}</span>
                      </div>
                    )}
                  </div>

                  <div className="exercise-card__body">
                    <div className="exercise-card__header">
                      <div>
                        <p className="exercise-focus">{exercise.focus}</p>
                        <h3>{exercise.name}</h3>
                      </div>

                      <div className="exercise-mini-metrics">
                        <span>{formatMetric(currentSummary.totalLoad, 0)} kg</span>
                        <span>{formatMetric(currentSummary.averageReps)} reps</span>
                        <span className={`delta delta--${deltaTone}`}>
                          {previousSummary
                            ? getDeltaLabel(currentSummary.totalLoad, previousSummary.totalLoad)
                            : 'sem comparacao'}
                        </span>
                      </div>
                    </div>

                    <label className="field">
                      <span>Descricao rapida</span>
                      <textarea
                        rows={3}
                        value={noteValue}
                        onChange={(event) => updateExerciseNote(exercise.id, event.target.value)}
                      />
                    </label>

                    <div className="exercise-actions">
                      {exercise.videoUrl ? (
                        <a
                          className="button button--secondary"
                          href={exercise.videoUrl}
                          rel="noreferrer"
                          target="_blank"
                        >
                          Abrir video
                        </a>
                      ) : null}
                      <label className="button button--ghost button--file">
                        Adicionar foto
                        <input
                          accept="image/*"
                          hidden
                          type="file"
                          onChange={(event) => {
                            void handleImageChange(exercise.id, event);
                          }}
                        />
                      </label>
                      {customization.imageDataUrl ? (
                        <button
                          className="button button--ghost"
                          type="button"
                          onClick={() => removeExerciseImage(exercise.id)}
                        >
                          Remover foto
                        </button>
                      ) : null}
                    </div>

                    <div className="set-grid">
                      {exerciseLog.sets.map((setEntry, setIndex) => (
                        <div key={`${exercise.id}-${setIndex}`} className="set-row">
                          <span className="set-badge">S{setIndex + 1}</span>

                          <label className="inline-field">
                            <span>Kg</span>
                            <input
                              inputMode="decimal"
                              placeholder="0"
                              type="text"
                              value={setEntry.load}
                              onChange={(event) =>
                                updateSetValue(exercise.id, setIndex, 'load', event.target.value)
                              }
                            />
                          </label>

                          <label className="inline-field">
                            <span>Reps</span>
                            <input
                              inputMode="decimal"
                              placeholder="0"
                              type="text"
                              value={setEntry.reps}
                              onChange={(event) =>
                                updateSetValue(exercise.id, setIndex, 'reps', event.target.value)
                              }
                            />
                          </label>
                        </div>
                      ))}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </div>

        <aside className="panel panel--side">
          <section className="side-block">
            <div className="section-heading-row section-heading-row--compact">
              <div>
                <p className="section-kicker">Resumo rapido</p>
                <h2>Semana atual</h2>
              </div>
            </div>

            <div className="summary-list">
              {appState.templates.map((workout) => {
                const workoutLog =
                  activeWeek.workoutLogs.find((entry) => entry.workoutId === workout.id) ??
                  activeWeek.workoutLogs[0];
                const summary = getWorkoutSummary(workoutLog);
                const isActive = workout.id === activeWorkout.id;

                return (
                  <button
                    key={workout.id}
                    className={`summary-item ${isActive ? 'summary-item--active' : ''}`}
                    type="button"
                    onClick={() => {
                      updateState((currentState) => ({
                        ...currentState,
                        activeWorkoutId: workout.id
                      }));
                    }}
                  >
                    <div>
                      <strong>{workout.name}</strong>
                      <small>{workout.subtitle}</small>
                    </div>
                    <div>
                      <strong>{formatMetric(summary.totalLoad, 0)} kg</strong>
                      <small>{formatMetric(summary.averageReps)} reps</small>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="side-block">
            <div className="section-heading-row section-heading-row--compact">
              <div>
                <p className="section-kicker">Historico</p>
                <h2>Comparacao por semana</h2>
              </div>
            </div>

            <div className="history-list">
              {[...appState.weeks].reverse().map((week) => {
                const summary = getWeekSummary(week);
                const isActive = week.id === activeWeek.id;

                return (
                  <button
                    key={week.id}
                    className={`history-card ${isActive ? 'history-card--active' : ''}`}
                    type="button"
                    onClick={() => {
                      updateState((currentState) => ({
                        ...currentState,
                        activeWeekId: week.id
                      }));
                    }}
                  >
                    <div>
                      <strong>{week.label}</strong>
                      <small>{formatDateLabel(week.createdAt)}</small>
                    </div>
                    <div>
                      <strong>{formatMetric(summary.totalLoad, 0)} kg</strong>
                      <small>{formatMetric(summary.averageReps)} reps</small>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="side-block side-block--guide">
            <div className="section-heading-row section-heading-row--compact">
              <div>
                <p className="section-kicker">Fluxo simples</p>
                <h2>Como usar</h2>
              </div>
            </div>

            <ul className="guide-list">
              <li>Use Nova semana para duplicar a ficha e evitar copiar coluna por coluna.</li>
              <li>O app já importa thumb e link do catalogo; se quiser, substitua por uma foto sua.</li>
              <li>Exporte o JSON antes de trocar de celular ou limpar o navegador.</li>
              <li>Se quiser publicar, troque o PIN padrao no arquivo de configuracao antes do deploy.</li>
            </ul>

            {previousWorkoutSummary ? (
              <div className="comparison-card">
                <span className="metric-label">Comparacao do treino ativo</span>
                <strong>
                  {getDeltaLabel(activeWorkoutSummary.totalLoad, previousWorkoutSummary.totalLoad)} de carga
                </strong>
                <small>
                  Semana anterior: {formatMetric(previousWorkoutSummary.totalLoad, 0)} kg total
                </small>
              </div>
            ) : null}
          </section>
        </aside>
      </section>
    </main>
  );
}

export default App;