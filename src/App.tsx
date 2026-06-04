import { useEffect, useMemo, useRef, useState } from 'react';
import PinGate from './components/PinGate';
import WorkbookSheet from './components/WorkbookSheet';
import { APP_NAME, SESSION_UNLOCK_KEY, STATIC_PIN } from './config';
import { FEEDBACK_QUESTIONS, normalizeFeedbackState } from './data/feedback';
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
type SaveStatus = 'saved' | 'saving' | 'dirty';

const getCompletion = (workoutLog: AppState['weeks'][number]['workoutLogs'][number]) => {
  const total = workoutLog.exerciseLogs.reduce((count, exerciseLog) => count + exerciseLog.sets.length, 0);
  const completed = workoutLog.exerciseLogs.reduce(
    (count, exerciseLog) =>
      count + exerciseLog.sets.filter((setEntry) => setEntry.load.trim() && setEntry.reps.trim()).length,
    0
  );

  return { completed, total };
};

const formatSavedAt = (date: Date | null) =>
  date
    ? new Intl.DateTimeFormat('pt-BR', {
        hour: '2-digit',
        minute: '2-digit'
      }).format(date)
    : 'agora';

function App() {
  const [appState, setAppState] = useState<AppState | null>(null);
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [pinValue, setPinValue] = useState('');
  const [pinError, setPinError] = useState('');
  const [flashMessage, setFlashMessage] = useState('');
  const [isExportingWorkbook, setIsExportingWorkbook] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [isSheetPreviewVisible, setIsSheetPreviewVisible] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
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
      setSaveStatus('saving');

      void saveAppState(appState).then(() => {
        setLastSavedAt(new Date());
        setSaveStatus('saved');
      });
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
    setSaveStatus('dirty');
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
  const activeCompletion = getCompletion(activeWorkoutLog);
  const activeProgress = activeCompletion.total
    ? Math.round((activeCompletion.completed / activeCompletion.total) * 100)
    : 0;
  const activeEntries = activeWorkout.exercises.map((exercise) => ({
    template: exercise,
    log: activeWorkoutLog.exerciseLogs.find((entry) => entry.exerciseId === exercise.id)
  }));
  const feedbackState = normalizeFeedbackState(appState.feedback, appState.weeks.length);
  const activeFeedbackAnswers = feedbackState.weeklyAnswers[appState.activeWeekIndex] ?? [];

  const saveStatusLabel =
    saveStatus === 'dirty'
      ? 'Alteracoes pendentes'
      : saveStatus === 'saving'
        ? 'Salvando...'
        : `Salvo ${formatSavedAt(lastSavedAt)}`;

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

  const updateFeedbackAnswer = (questionIndex: number, value: string) => {
    updateState((currentState) => {
      const nextFeedback = normalizeFeedbackState(currentState.feedback, currentState.weeks.length);

      nextFeedback.weeklyAnswers[currentState.activeWeekIndex][questionIndex] = value;

      return {
        ...currentState,
        feedback: nextFeedback
      };
    });
  };

  const updateFeedbackComment = (value: string) => {
    updateState((currentState) => {
      const nextFeedback = normalizeFeedbackState(currentState.feedback, currentState.weeks.length);

      nextFeedback.weeklyComments[currentState.activeWeekIndex] = value;

      return {
        ...currentState,
        feedback: nextFeedback
      };
    });
  };

  const updatePhotoNote = (value: string) => {
    updateState((currentState) => {
      const nextFeedback = normalizeFeedbackState(currentState.feedback, currentState.weeks.length);

      nextFeedback.photoNote = value;

      return {
        ...currentState,
        feedback: nextFeedback
      };
    });
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

  const handleSubmitWorkout = async () => {
    setSaveStatus('saving');

    try {
      await saveAppState(appState);
      setLastSavedAt(new Date());
      setSaveStatus('saved');
      setFlashMessage('Dados salvos corretamente.');
    } catch {
      setFlashMessage('Nao foi possivel salvar agora.');
    }
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
          <h1>{activeWeek.label} · {activeWorkout.name}</h1>
          <p>
            {activeCompletion.completed}/{activeCompletion.total} series preenchidas · {saveStatusLabel}
          </p>
        </div>

        <div className="toolbar__actions">
          <button
            className="button button--primary"
            disabled={saveStatus === 'saving'}
            type="button"
            onClick={() => {
              void handleSubmitWorkout();
            }}
          >
            {saveStatus === 'saving' ? 'Salvando...' : 'Salvar dados'}
          </button>
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
          <button
            className="button button--secondary"
            type="button"
            onClick={() => {
              setIsSheetPreviewVisible((currentValue) => !currentValue);
            }}
          >
            {isSheetPreviewVisible ? 'Ocultar planilha' : 'Ver planilha'}
          </button>
          <button className="button button--ghost" type="button" onClick={handleLock}>
            Travar
          </button>
        </div>
      </header>

      {flashMessage ? <div className="toast">{flashMessage}</div> : null}

      <section className="dashboard-panel" aria-label="Resumo da ficha">
        <article className="metric-card metric-card--accent">
          <span>Semana</span>
          <strong>{formatMetric(activeWeekSummary.totalLoad, 0)} kg</strong>
          <small>{formatMetric(activeWeekSummary.averageReps)} reps de media</small>
        </article>
        <article className="metric-card">
          <span>Treino ativo</span>
          <strong>{formatMetric(activeWorkoutSummary.totalLoad, 0)} kg</strong>
          <small>{activeWorkout.subtitle}</small>
        </article>
        <article className="metric-card">
          <span>Preenchimento</span>
          <strong>{activeProgress}%</strong>
          <small>{activeCompletion.completed} de {activeCompletion.total} series</small>
        </article>
      </section>

      <section className="progress-panel" aria-label="Progresso do treino">
        <div>
          <span className={`save-dot save-dot--${saveStatus}`} />
          <strong>{saveStatusLabel}</strong>
        </div>
        <div className="progress-bar" aria-hidden="true">
          <span style={{ width: `${activeProgress}%` }} />
        </div>
      </section>

      <section className="guidance-panel" aria-label="Como preencher">
        <strong>Preencha apenas as series coloridas</strong>
        <span>
          O Excel exportado preserva o modelo original e atualiza somente cargas, repeticoes, resumos e feedback.
        </span>
      </section>

      <section className="choice-panel" aria-label="Escolha a semana">
        <div className="section-heading">
          <span>1</span>
          <div>
            <p>Semana</p>
            <h2>Escolha onde preencher</h2>
          </div>
        </div>
        <div className="week-strip">
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
        </div>
      </section>

      <section className="choice-panel" aria-label="Escolha o treino">
        <div className="section-heading">
          <span>2</span>
          <div>
            <p>Treino</p>
            <h2>Abra a ficha do dia</h2>
          </div>
        </div>
        <div className="workout-strip">
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
        </div>
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

      {isSheetPreviewVisible ? (
        <section className="sheet-preview-panel" aria-label="Previa da planilha Excel">
          <div className="section-heading">
            <span>3</span>
            <div>
              <p>Excel</p>
              <h2>Conferencia do layout</h2>
            </div>
          </div>
          <div className="sheet-preview-panel__scroller">
            <WorkbookSheet cellValues={workbookCellValues} layout={workbookLayout} />
          </div>
        </section>
      ) : null}

      <div className="section-heading section-heading--floating">
        <span>{isSheetPreviewVisible ? '4' : '3'}</span>
        <div>
          <p>Series</p>
          <h2>Preencha carga e repeticoes</h2>
        </div>
      </div>

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
                    <span className="set-card__title">
                      Serie {setEntry.slotIndex + 1} · {setEntry.type === 'orange' ? 'aquecimento' : 'valida'}
                    </span>
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

      <section className="feedback-panel" aria-label="Feedback do periodo">
        <div className="section-heading">
          <span>{isSheetPreviewVisible ? '5' : '4'}</span>
          <div>
            <p>Feedback</p>
            <h2>{activeWeek.label}</h2>
          </div>
        </div>

        <div className="feedback-grid">
          {FEEDBACK_QUESTIONS.map((question, questionIndex) => (
            <label key={question.rowNumber} className="feedback-field">
              <span>{question.text}</span>
              <textarea
                rows={2}
                value={activeFeedbackAnswers[questionIndex] ?? ''}
                onChange={(event) => updateFeedbackAnswer(questionIndex, event.target.value)}
              />
            </label>
          ))}
        </div>

        <label className="feedback-field feedback-field--wide">
          <span>Comentarios da {activeWeek.label}</span>
          <textarea
            rows={4}
            value={feedbackState.weeklyComments[appState.activeWeekIndex] ?? ''}
            onChange={(event) => updateFeedbackComment(event.target.value)}
          />
        </label>

        {appState.activeWeekIndex === 5 ? (
          <label className="feedback-field feedback-field--wide">
            <span>Semana 6 fotos</span>
            <textarea
              rows={3}
              value={feedbackState.photoNote}
              onChange={(event) => updatePhotoNote(event.target.value)}
            />
          </label>
        ) : null}
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
