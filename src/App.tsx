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
  normalizeAppState,
  sanitizeNumericInput
} from './lib/state';
import { buildSheetDisplayValues, exportWorkbookFile, exportWorkbookPdf } from './lib/workbook';
import {
  createGymSupabaseClient,
  getSupabaseConfig,
  hasSupabaseConfig,
  hydrateRemotePhotoUrls,
  loadRemoteAppState,
  saveRemoteAppState,
  uploadPhotoAsset
} from './lib/supabase';
import type { AppState, LocalMediaAsset, SetType, SheetLayout } from './types';

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

const formatDuration = (totalSeconds: number) => {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;

  if (hours) {
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

const getSetTypeLabel = (type: SetType) => {
  if (type === 'yellow') {
    return 'Aquecimento';
  }

  if (type === 'orange') {
    return 'Serie seria';
  }

  return 'Serie dificil';
};

const readFileAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

const dataUrlToFile = async (dataUrl: string, name: string, fallbackType = 'image/jpeg') => {
  const response = await fetch(dataUrl);
  const blob = await response.blob();

  return new File([blob], name, { type: blob.type || fallbackType });
};

const formatBytes = (bytes?: number) => {
  if (!bytes) {
    return '';
  }

  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }

  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};

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
  const [now, setNow] = useState(Date.now());
  const [workoutStartedAt, setWorkoutStartedAt] = useState<number | null>(null);
  const [workoutEndedAt, setWorkoutEndedAt] = useState<number | null>(null);
  const [activeExerciseTimer, setActiveExerciseTimer] = useState<{ exerciseId: string; startedAt: number } | null>(null);
  const [restDurationSeconds, setRestDurationSeconds] = useState(90);
  const [restEndsAt, setRestEndsAt] = useState<number | null>(null);
  const [supabaseUserEmail, setSupabaseUserEmail] = useState<string | null>(null);
  const [supabaseEmail, setSupabaseEmail] = useState('');
  const [supabasePassword, setSupabasePassword] = useState('');
  const [supabaseStatus, setSupabaseStatus] = useState('');
  const [isSupabaseBusy, setIsSupabaseBusy] = useState(false);
  const pdfExportRef = useRef<HTMLDivElement | null>(null);
  const supabaseClient = useMemo(
    () => createGymSupabaseClient(appState?.supabase),
    [appState?.supabase?.anonKey, appState?.supabase?.projectUrl]
  );

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    let isMounted = true;

    setIsUnlocked(sessionStorage.getItem(SESSION_UNLOCK_KEY) === 'true');

    void loadAppState().then((savedState) => {
      if (!isMounted) {
        return;
      }

      const nextState = savedState && isAppState(savedState) ? normalizeAppState(savedState) : createSeedAppState();

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

  useEffect(() => {
    if (!supabaseClient) {
      setSupabaseUserEmail(null);
      return undefined;
    }

    let isMounted = true;

    void supabaseClient.auth.getSession().then(({ data }) => {
      if (isMounted) {
        setSupabaseUserEmail(data.session?.user.email ?? null);
      }
    });

    const {
      data: { subscription }
    } = supabaseClient.auth.onAuthStateChange((_event, session) => {
      setSupabaseUserEmail(session?.user.email ?? null);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [supabaseClient]);

  const workbookCellValues = useMemo(
    () => (appState ? buildSheetDisplayValues(appState, workbookLayout, appState.activeWeekIndex) : {}),
    [appState]
  );

  const updateState = (updater: (currentState: AppState) => AppState) => {
    setSaveStatus('dirty');
    setAppState((currentState) => (currentState ? normalizeAppState(updater(currentState)) : currentState));
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
  const activeMedia = (appState.localMedia ?? []).filter(
    (asset) => asset.weekIndex === appState.activeWeekIndex && asset.workoutId === activeWorkout.id
  );
  const workoutElapsedSeconds = workoutStartedAt
    ? Math.floor(((workoutEndedAt ?? now) - workoutStartedAt) / 1000)
    : 0;
  const restRemainingSeconds = restEndsAt ? Math.max(0, Math.ceil((restEndsAt - now) / 1000)) : 0;

  const saveStatusLabel =
    saveStatus === 'dirty'
      ? 'Alteracoes pendentes'
      : saveStatus === 'saving'
        ? 'Salvando...'
        : `Salvo ${formatSavedAt(lastSavedAt)}`;
  const supabaseConfig = getSupabaseConfig(appState.supabase);
  const isSupabaseConfigured = hasSupabaseConfig(appState.supabase);
  const isUsingEnvSupabase = Boolean(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY);

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
    if (!pdfExportRef.current) {
      return;
    }

    setIsExportingPdf(true);

    try {
      await exportWorkbookPdf(pdfExportRef.current, appState.activeWeekIndex);
      setFlashMessage('PDF com ficha e feedback exportado.');
    } catch {
      setFlashMessage('Nao foi possivel exportar o PDF.');
    } finally {
      setIsExportingPdf(false);
    }
  };

  const handleAddMedia = async (files: FileList | null) => {
    if (!files?.length) {
      return;
    }

    try {
      const media = await Promise.all(
        Array.from(files).map(async (file): Promise<LocalMediaAsset> => {
          const asset: LocalMediaAsset = {
            id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
            type: file.type.startsWith('video/') ? 'video' : 'photo',
            name: file.name,
            dataUrl: await readFileAsDataUrl(file),
            mimeType: file.type,
            originalBytes: file.size,
            createdAt: new Date().toISOString(),
            weekIndex: appState.activeWeekIndex,
            workoutId: activeWorkout.id
          };

          if (asset.type !== 'photo' || !supabaseClient || !appState.supabase?.enabled) {
            return asset;
          }

          const {
            data: { user }
          } = await supabaseClient.auth.getUser();

          return user ? uploadPhotoAsset(supabaseClient, user, asset, file) : asset;
        })
      );

      updateState((currentState) => ({
        ...currentState,
        localMedia: [...(currentState.localMedia ?? []), ...media]
      }));
      setFlashMessage(
        media.some((asset) => asset.storagePath)
          ? 'Fotos sincronizadas; videos ficaram no dispositivo.'
          : 'Midia salva neste dispositivo.'
      );
    } catch {
      setFlashMessage('Nao foi possivel salvar a midia.');
    }
  };

  const handleRemoveMedia = (assetId: string) => {
    updateState((currentState) => ({
      ...currentState,
      localMedia: (currentState.localMedia ?? []).filter((asset) => asset.id !== assetId)
    }));
  };

  const handleSupabaseAuth = async (mode: 'sign-in' | 'sign-up') => {
    if (!supabaseClient) {
      setSupabaseStatus('Configure a URL e a anon key do projeto.');
      return;
    }

    setIsSupabaseBusy(true);
    setSupabaseStatus('');

    try {
      const authRequest =
        mode === 'sign-up'
          ? supabaseClient.auth.signUp({ email: supabaseEmail.trim(), password: supabasePassword })
          : supabaseClient.auth.signInWithPassword({ email: supabaseEmail.trim(), password: supabasePassword });
      const { error } = await authRequest;

      if (error) {
        throw error;
      }

      setSupabasePassword('');
      setSupabaseStatus(mode === 'sign-up' ? 'Cadastro criado. Confirme o email se o projeto exigir.' : 'Login conectado.');
    } catch (error) {
      setSupabaseStatus(error instanceof Error ? error.message : 'Nao foi possivel autenticar.');
    } finally {
      setIsSupabaseBusy(false);
    }
  };

  const handleSupabaseSignOut = async () => {
    if (!supabaseClient) {
      return;
    }

    await supabaseClient.auth.signOut();
    setSupabaseStatus('Sessao encerrada.');
  };

  const uploadPendingPhotos = async (userId: string) => {
    if (!supabaseClient) {
      return appState.localMedia ?? [];
    }

    const {
      data: { user }
    } = await supabaseClient.auth.getUser();

    if (!user || user.id !== userId) {
      return appState.localMedia ?? [];
    }

    return Promise.all(
      (appState.localMedia ?? []).map(async (asset) => {
        if (asset.type !== 'photo' || asset.storagePath || !asset.dataUrl) {
          return asset;
        }

        const file = await dataUrlToFile(asset.dataUrl, asset.name, asset.mimeType);

        return uploadPhotoAsset(supabaseClient, user, asset, file);
      })
    );
  };

  const handlePushToSupabase = async () => {
    if (!supabaseClient) {
      setSupabaseStatus('Configure o Supabase antes de sincronizar.');
      return;
    }

    setIsSupabaseBusy(true);
    setSupabaseStatus('Enviando dados...');

    try {
      const {
        data: { user }
      } = await supabaseClient.auth.getUser();

      if (!user) {
        setSupabaseStatus('Entre na sua conta antes de sincronizar.');
        return;
      }

      const nextMedia = await uploadPendingPhotos(user.id);
      const nextState = normalizeAppState({
        ...appState,
        localMedia: nextMedia
      });

      await saveRemoteAppState(supabaseClient, user, nextState);
      setAppState(nextState);
      await saveAppState(nextState);
      setLastSavedAt(new Date());
      setSaveStatus('saved');
      setSupabaseStatus('Dados enviados. Fotos otimizadas foram para o Storage; videos ficaram locais.');
    } catch (error) {
      setSupabaseStatus(error instanceof Error ? error.message : 'Falha ao enviar para o Supabase.');
    } finally {
      setIsSupabaseBusy(false);
    }
  };

  const handlePullFromSupabase = async () => {
    if (!supabaseClient) {
      setSupabaseStatus('Configure o Supabase antes de baixar.');
      return;
    }

    setIsSupabaseBusy(true);
    setSupabaseStatus('Baixando dados...');

    try {
      const remoteState = await loadRemoteAppState(supabaseClient);

      if (!remoteState) {
        setSupabaseStatus('Nenhum estado salvo para este usuario.');
        return;
      }

      const hydratedState = await hydrateRemotePhotoUrls(supabaseClient, remoteState);
      const localVideos = (appState.localMedia ?? []).filter((asset) => asset.type === 'video');
      const nextState = normalizeAppState({
        ...hydratedState,
        supabase: appState.supabase,
        localMedia: [...(hydratedState.localMedia ?? []), ...localVideos]
      });

      setAppState(nextState);
      await saveAppState(nextState);
      setLastSavedAt(new Date());
      setSaveStatus('saved');
      setSupabaseStatus('Dados baixados. Videos locais foram preservados neste dispositivo.');
    } catch (error) {
      setSupabaseStatus(error instanceof Error ? error.message : 'Falha ao baixar do Supabase.');
    } finally {
      setIsSupabaseBusy(false);
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
      <header className="app-header">
        <div>
          <p className="pin-brand">{APP_NAME}</p>
          <h1>{activeWorkout.name}</h1>
          <p>
            {activeWeek.label} · {activeCompletion.completed}/{activeCompletion.total} series · {saveStatusLabel}
          </p>
        </div>
        <button className="button button--secondary header-lock" type="button" onClick={handleLock}>
          Travar
        </button>
      </header>

      {flashMessage ? <div className="toast">{flashMessage}</div> : null}

      <section className="dashboard-panel" aria-label="Resumo da ficha">
        <article className="metric-card metric-card--accent">
          <span>Semana</span>
          <strong>{formatMetric(activeWeekSummary.totalLoad, 0)} kg</strong>
          <small>{formatMetric(activeWeekSummary.averageReps)} reps media</small>
        </article>
        <article className="metric-card">
          <span>Treino</span>
          <strong>{formatMetric(activeWorkoutSummary.totalLoad, 0)} kg</strong>
          <small>{activeWorkout.subtitle}</small>
        </article>
        <article className="metric-card">
          <span>Preenchimento</span>
          <strong>{activeProgress}%</strong>
          <small>{activeCompletion.completed} de {activeCompletion.total} series</small>
        </article>
      </section>

      <section className="timer-panel" id="timer" aria-label="Temporizadores">
        <article className="timer-card">
          <span>Treino</span>
          <strong>{workoutStartedAt ? formatDuration(workoutElapsedSeconds) : '00:00'}</strong>
          <div className="button-row">
            <button
              className="button button--primary"
              type="button"
              onClick={() => {
                setWorkoutStartedAt(Date.now());
                setWorkoutEndedAt(null);
              }}
            >
              Iniciar
            </button>
            <button
              className="button button--secondary"
              disabled={!workoutStartedAt || Boolean(workoutEndedAt)}
              type="button"
              onClick={() => setWorkoutEndedAt(Date.now())}
            >
              Fim
            </button>
          </div>
        </article>

        <article className="timer-card timer-card--rest">
          <span>Descanso</span>
          <strong>{formatDuration(restRemainingSeconds)}</strong>
          <div className="rest-controls">
            {[60, 90, 120].map((seconds) => (
              <button
                key={seconds}
                className={seconds === restDurationSeconds ? 'mini-chip mini-chip--active' : 'mini-chip'}
                type="button"
                onClick={() => setRestDurationSeconds(seconds)}
              >
                {seconds}s
              </button>
            ))}
          </div>
          <div className="button-row">
            <button
              className="button button--primary"
              type="button"
              onClick={() => setRestEndsAt(Date.now() + restDurationSeconds * 1000)}
            >
              Descansar
            </button>
            <button className="button button--secondary" type="button" onClick={() => setRestEndsAt(null)}>
              Zerar
            </button>
          </div>
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

      <section className="choice-panel" id="weeks" aria-label="Escolha a semana">
        <div className="section-heading">
          <div>
            <p>Semana</p>
            <h2>Periodo de 6 semanas</h2>
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
          <div>
            <p>Treino</p>
            <h2>Ficha do dia</h2>
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

      <section className="legend-panel" aria-label="Cores das series">
        <span className="legend-pill legend-pill--yellow">Aquecimento</span>
        <span className="legend-pill legend-pill--orange">Serie seria</span>
        <span className="legend-pill legend-pill--red">Serie dificil</span>
      </section>

      <section className="action-panel" aria-label="Acoes da ficha">
        <button
          className="button button--primary"
          disabled={saveStatus === 'saving'}
          type="button"
          onClick={() => {
            void handleSubmitWorkout();
          }}
        >
          {saveStatus === 'saving' ? 'Salvando...' : 'Salvar'}
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
          {isExportingWorkbook ? 'Excel...' : 'Excel'}
        </button>
        <button
          className="button button--secondary"
          disabled={isExportingPdf}
          type="button"
          onClick={() => {
            void handleExportPdf();
          }}
        >
          {isExportingPdf ? 'PDF...' : 'PDF'}
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
      </section>

      {isSheetPreviewVisible ? (
        <section className="sheet-preview-panel" aria-label="Previa da planilha Excel">
          <div className="section-heading">
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

      <div className="section-heading section-heading--floating" id="sets">
        <div>
          <p>Series</p>
          <h2>Carga, repeticoes e historico</h2>
        </div>
      </div>

      <section className="exercise-stack">
        {activeEntries.map(({ template, log }) => {
          if (!log) {
            return null;
          }

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
                    className="button button--secondary"
                    type="button"
                    onClick={() => {
                      setActiveExerciseTimer((currentValue) =>
                        currentValue?.exerciseId === template.id ? null : { exerciseId: template.id, startedAt: Date.now() }
                      );
                    }}
                  >
                    {activeExerciseTimer?.exerciseId === template.id ? `Fim ${formatDuration(exerciseElapsedSeconds)}` : 'Iniciar'}
                  </button>
                  {template.videoUrl ? (
                    <a className="video-link" href={template.videoUrl} rel="noreferrer" target="_blank">
                      Video
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
                      Serie {setEntry.slotIndex + 1} · {getSetTypeLabel(setEntry.type)}
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

              <div className="history-strip" aria-label={`Historico de ${template.name}`}>
                {appState.weeks.map((week) => {
                  const workoutLog = week.workoutLogs.find((entry) => entry.workoutId === activeWorkout.id);
                  const exerciseLog = workoutLog?.exerciseLogs.find((entry) => entry.exerciseId === template.id);
                  const completedSets = exerciseLog?.sets.filter((setEntry) => setEntry.load || setEntry.reps) ?? [];

                  return (
                    <div key={`${template.id}-${week.index}`} className="history-chip">
                      <strong>S{week.index + 1}</strong>
                      <span>{formatMetric(exerciseLog?.summary.totalLoad ?? null, 0)} kg</span>
                      <small>
                        {completedSets.length
                          ? completedSets.map((setEntry) => `${setEntry.load || '-'}x${setEntry.reps || '-'}`).join(' / ')
                          : '-'}
                      </small>
                    </div>
                  );
                })}
              </div>
            </article>
          );
        })}
      </section>

      <section className="feedback-panel" id="feedback" aria-label="Feedback do periodo">
        <div className="section-heading">
          <div>
            <p>Feedback</p>
            <h2>{activeWeek.label}</h2>
          </div>
        </div>

        <div className="feedback-grid">
          {FEEDBACK_QUESTIONS.map((question, questionIndex) => (
            <label key={question.rowNumber} className="feedback-field">
              <span>{question.text}</span>
              <select
                value={activeFeedbackAnswers[questionIndex] ?? ''}
                onChange={(event) => updateFeedbackAnswer(questionIndex, event.target.value)}
              >
                <option value="">Selecione</option>
                {question.options.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
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

      <section className="media-panel" id="media" aria-label="Midia local">
        <div className="section-heading">
          <div>
            <p>Midia local</p>
            <h2>Fotos e videos do treino</h2>
          </div>
        </div>
        <label className="upload-box">
          <input
            accept="image/*,video/*"
            multiple
            type="file"
            onChange={(event) => {
              void handleAddMedia(event.target.files);
              event.currentTarget.value = '';
            }}
          />
          <span>Adicionar foto ou video</span>
        </label>

        <div className="media-grid">
          {activeMedia.map((asset) => (
            <article key={asset.id} className="media-card">
              {asset.type === 'video' ? (
                <video controls src={asset.dataUrl} />
              ) : (
                <img alt={asset.name} src={asset.remoteUrl ?? asset.dataUrl} />
              )}
              <div>
                <strong>{asset.name}</strong>
                {asset.type === 'photo' && asset.optimizedBytes ? (
                  <small>
                    {formatBytes(asset.originalBytes)} para {formatBytes(asset.optimizedBytes)}
                  </small>
                ) : null}
                <button className="mini-chip" type="button" onClick={() => handleRemoveMedia(asset.id)}>
                  Remover
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="sync-panel" aria-label="Supabase">
        <div className="section-heading">
          <div>
            <p>Supabase</p>
            <h2>Auth, dados e fotos</h2>
          </div>
        </div>

        <div className={`sync-status${isSupabaseConfigured ? ' sync-status--ready' : ''}`}>
          <strong>{isSupabaseConfigured ? 'Configurado' : 'Nao configurado'}</strong>
          <span>
            {supabaseUserEmail
              ? `Conectado como ${supabaseUserEmail}`
              : isSupabaseConfigured
                ? 'Entre para sincronizar dados e fotos.'
                : 'Informe URL e anon key ou crie um arquivo .env.local.'}
          </span>
        </div>

        <label className="switch-row">
          <input
            checked={appState.supabase?.enabled ?? false}
            type="checkbox"
            onChange={(event) =>
              updateState((currentState) => ({
                ...currentState,
                supabase: {
                  enabled: event.target.checked,
                  projectUrl: currentState.supabase?.projectUrl ?? '',
                  anonKey: currentState.supabase?.anonKey ?? ''
                }
              }))
            }
          />
          <span>Sincronizar dados do app e fotos otimizadas; videos ficam somente neste dispositivo</span>
        </label>

        <div className="sync-grid">
          <label className="feedback-field">
            <span>Project URL</span>
            <input
              disabled={isUsingEnvSupabase}
              placeholder="https://seu-projeto.supabase.co"
              value={appState.supabase?.projectUrl ?? ''}
              onChange={(event) =>
                updateState((currentState) => ({
                  ...currentState,
                  supabase: {
                    enabled: currentState.supabase?.enabled ?? false,
                    projectUrl: event.target.value,
                    anonKey: currentState.supabase?.anonKey ?? ''
                  }
                }))
              }
            />
          </label>
          <label className="feedback-field">
            <span>Anon key</span>
            <input
              disabled={isUsingEnvSupabase}
              placeholder={isUsingEnvSupabase ? 'Carregada do .env.local' : 'eyJ...'}
              type="password"
              value={appState.supabase?.anonKey ?? ''}
              onChange={(event) =>
                updateState((currentState) => ({
                  ...currentState,
                  supabase: {
                    enabled: currentState.supabase?.enabled ?? false,
                    projectUrl: currentState.supabase?.projectUrl ?? '',
                    anonKey: event.target.value
                  }
                }))
              }
            />
          </label>
        </div>

        <div className="auth-grid">
          <label className="feedback-field">
            <span>Email</span>
            <input
              autoComplete="email"
              inputMode="email"
              type="email"
              value={supabaseEmail}
              onChange={(event) => setSupabaseEmail(event.target.value)}
            />
          </label>
          <label className="feedback-field">
            <span>Senha</span>
            <input
              autoComplete="current-password"
              type="password"
              value={supabasePassword}
              onChange={(event) => setSupabasePassword(event.target.value)}
            />
          </label>
        </div>

        <div className="sync-actions">
          <button
            className="button button--primary"
            disabled={!isSupabaseConfigured || isSupabaseBusy || Boolean(supabaseUserEmail)}
            type="button"
            onClick={() => {
              void handleSupabaseAuth('sign-in');
            }}
          >
            Entrar
          </button>
          <button
            className="button button--secondary"
            disabled={!isSupabaseConfigured || isSupabaseBusy || Boolean(supabaseUserEmail)}
            type="button"
            onClick={() => {
              void handleSupabaseAuth('sign-up');
            }}
          >
            Criar conta
          </button>
          <button
            className="button button--secondary"
            disabled={!supabaseUserEmail || isSupabaseBusy}
            type="button"
            onClick={() => {
              void handlePushToSupabase();
            }}
          >
            Enviar agora
          </button>
          <button
            className="button button--secondary"
            disabled={!supabaseUserEmail || isSupabaseBusy}
            type="button"
            onClick={() => {
              void handlePullFromSupabase();
            }}
          >
            Baixar dados
          </button>
          <button
            className="button button--ghost"
            disabled={!supabaseUserEmail || isSupabaseBusy}
            type="button"
            onClick={() => {
              void handleSupabaseSignOut();
            }}
          >
            Sair
          </button>
        </div>

        {supabaseStatus ? <p className="sync-message">{supabaseStatus}</p> : null}
        <p className="sync-note">
          Fotos sao redimensionadas para ate 1800px e salvas em WebP/JPEG de alta qualidade. Videos nao sao enviados.
          URL ativa: {supabaseConfig.projectUrl || 'sem URL'}.
        </p>
      </section>

      <nav className="bottom-tabs" aria-label="Navegacao principal">
        <a href="#weeks">Semanas</a>
        <a href="#timer">Timer</a>
        <a href="#sets">Series</a>
        <a href="#feedback">Feedback</a>
        <a href="#media">Midia</a>
      </nav>

      <div className="sheet-capture-surface" aria-hidden="true">
        <div ref={pdfExportRef} className="pdf-export-document">
          <section className="pdf-page">
            <h2>Ficha de cargas - {activeWeek.label}</h2>
            <WorkbookSheet cellValues={workbookCellValues} layout={workbookLayout} />
          </section>
          <section className="pdf-page">
            <h2>Feedback do periodo</h2>
            <table className="pdf-table">
              <thead>
                <tr>
                  <th>Pergunta</th>
                  {appState.weeks.map((week) => (
                    <th key={week.index}>{week.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {FEEDBACK_QUESTIONS.map((question, questionIndex) => (
                  <tr key={question.rowNumber}>
                    <td>{question.text}</td>
                    {appState.weeks.map((week) => (
                      <td key={week.index}>{feedbackState.weeklyAnswers[week.index]?.[questionIndex] ?? ''}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
          <section className="pdf-page">
            <h2>Feedback comentarios</h2>
            <table className="pdf-table pdf-table--comments">
              <tbody>
                {appState.weeks.map((week) => (
                  <tr key={week.index}>
                    <th>{week.label}</th>
                    <td>{feedbackState.weeklyComments[week.index] ?? ''}</td>
                  </tr>
                ))}
                <tr>
                  <th>Semana 6 fotos</th>
                  <td>{feedbackState.photoNote}</td>
                </tr>
              </tbody>
            </table>
          </section>
        </div>
      </div>
    </main>
  );
}

export default App;
