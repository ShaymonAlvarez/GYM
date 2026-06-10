import { useEffect, useRef, useState, useMemo } from 'react';
import LoginScreen from './components/LoginScreen';
import BottomNav from './components/BottomNav';
import type { ScreenId } from './components/BottomNav';
import DashboardScreen from './components/DashboardScreen';
import WorkoutScreen from './components/WorkoutScreen';
import FeedbackScreen from './components/FeedbackScreen';
import MediaScreen from './components/MediaScreen';
import SettingsScreen from './components/SettingsScreen';

import { FEEDBACK_QUESTIONS, normalizeFeedbackState } from './data/feedback';
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
  supabaseSingleton,
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
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [activeScreen, setActiveScreen] = useState<ScreenId>('dashboard');
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
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loginStatus, setLoginStatus] = useState('');
  const [supabaseStatus, setSupabaseStatus] = useState('');
  const [isSupabaseBusy, setIsSupabaseBusy] = useState(false);
  const [isLoginBusy, setIsLoginBusy] = useState(false);
  const pdfExportRef = useRef<HTMLDivElement | null>(null);

  // Use the singleton Supabase client — always available since .env.local is configured
  const supabaseClient = supabaseSingleton;

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    let isMounted = true;

    void loadAppState().then((savedState) => {
      if (!isMounted) {
        return;
      }

      const nextState = savedState && isAppState(savedState) ? normalizeAppState(savedState) : null;

      if (nextState) {
        setAppState(nextState);
      }
    });

    return () => {
      isMounted = false;
    };
  }, []);

  // Check auth state on mount — if user has a valid session, auto-authenticate
  useEffect(() => {
    if (!supabaseClient) {
      return undefined;
    }

    let isMounted = true;

    void supabaseClient.auth.getSession().then(async ({ data }) => {
      if (isMounted && data.session?.user) {
        setSupabaseUserEmail(data.session.user.email ?? null);
        setIsAuthenticated(true);
        // Ensure appState exists
        const savedState = await loadAppState();
        if (!isMounted) return;
        const { createSeedAppState } = await import('./data/seedData');
        const nextState = savedState && isAppState(savedState) ? normalizeAppState(savedState) : createSeedAppState();
        setAppState(nextState);
        if (!savedState || !isAppState(savedState)) {
          void saveAppState(nextState);
        }
      }
    });

    const {
      data: { subscription }
    } = supabaseClient.auth.onAuthStateChange((_event, session) => {
      setSupabaseUserEmail(session?.user.email ?? null);
      if (!session) {
        setIsAuthenticated(false);
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [supabaseClient]);

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
    const theme = appState?.theme ?? 'dark'; // dark is the default from our redesign
    const root = document.documentElement;

    if (theme === 'system') {
      const isSystemLight = window.matchMedia('(prefers-color-scheme: light)').matches;
      root.setAttribute('data-theme', isSystemLight ? 'light' : 'dark');
      
      const mediaQuery = window.matchMedia('(prefers-color-scheme: light)');
      const listener = (e: MediaQueryListEvent) => {
        if (appState?.theme === 'system') {
          root.setAttribute('data-theme', e.matches ? 'light' : 'dark');
        }
      };
      mediaQuery.addEventListener('change', listener);
      return () => mediaQuery.removeEventListener('change', listener);
    } else {
      root.setAttribute('data-theme', theme);
    }
  }, [appState?.theme]);

  const workbookCellValues = useMemo(
    () => (appState ? buildSheetDisplayValues(appState, workbookLayout, appState.activeWeekIndex) : {}),
    [appState]
  );

  const updateState = (updater: (currentState: AppState) => AppState) => {
    setSaveStatus('dirty');
    setAppState((currentState) => (currentState ? normalizeAppState(updater(currentState)) : currentState));
  };

  // ═══════════════════════════════════════════
  // LOGIN HANDLERS
  // ═══════════════════════════════════════════

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!supabaseClient) {
      setLoginError('Supabase não está configurado. Verifique o .env.local.');
      return;
    }

    setIsLoginBusy(true);
    setLoginError('');
    setLoginStatus('');

    try {
      const { error } = await supabaseClient.auth.signInWithPassword({
        email: loginEmail.trim(),
        password: loginPassword
      });

      if (error) {
        throw error;
      }

      setLoginPassword('');
      setIsAuthenticated(true);

      // Load or create app state after login
      const savedState = await loadAppState();
      const { createSeedAppState } = await import('./data/seedData');
      const nextState = savedState && isAppState(savedState) ? normalizeAppState(savedState) : createSeedAppState();
      setAppState(nextState);
      if (!savedState || !isAppState(savedState)) {
        void saveAppState(nextState);
      }
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : 'Não foi possível autenticar.');
    } finally {
      setIsLoginBusy(false);
    }
  };

  const handleSignUp = async () => {
    if (!supabaseClient) {
      setLoginError('Supabase não está configurado. Verifique o .env.local.');
      return;
    }

    setIsLoginBusy(true);
    setLoginError('');
    setLoginStatus('');

    try {
      const { error } = await supabaseClient.auth.signUp({
        email: loginEmail.trim(),
        password: loginPassword
      });

      if (error) {
        throw error;
      }

      setLoginPassword('');
      setLoginStatus('Cadastro criado. Confirme o email se o projeto exigir.');
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : 'Não foi possível criar a conta.');
    } finally {
      setIsLoginBusy(false);
    }
  };

  const handleLogout = async () => {
    if (supabaseClient) {
      await supabaseClient.auth.signOut();
    }
    setIsAuthenticated(false);
    setSupabaseUserEmail(null);
    setLoginEmail('');
    setLoginPassword('');
    setLoginError('');
    setLoginStatus('');
  };

  // ═══════════════════════════════════════════
  // WORKOUT HANDLERS (preserved from original)
  // ═══════════════════════════════════════════

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
    if (!appState || appState.activeWeekIndex === 0) {
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
    if (!appState) return;

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
    if (!appState) return;

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
    if (!appState) return;

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
    if (!pdfExportRef.current || !appState) {
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
    if (!files?.length || !appState) {
      return;
    }

    const activeWorkout =
      appState.templates.find((w) => w.id === appState.activeWorkoutId) ?? appState.templates[0];

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

  const uploadPendingPhotos = async (userId: string) => {
    if (!supabaseClient || !appState) {
      return appState?.localMedia ?? [];
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
    if (!supabaseClient || !appState) {
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
    if (!supabaseClient || !appState) {
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

  const handleSupabaseSignOut = async () => {
    if (!supabaseClient) {
      return;
    }

    await supabaseClient.auth.signOut();
    setSupabaseStatus('Sessão encerrada.');
  };

  // ═══════════════════════════════════════════
  // LOADING STATE
  // ═══════════════════════════════════════════

  if (!isAuthenticated) {
    return (
      <LoginScreen
        email={loginEmail}
        password={loginPassword}
        error={loginError}
        status={loginStatus}
        isBusy={isLoginBusy}
        onEmailChange={(value) => {
          setLoginEmail(value);
          setLoginError('');
        }}
        onPasswordChange={(value) => {
          setLoginPassword(value);
          setLoginError('');
        }}
        onSignIn={handleLogin}
        onSignUp={handleSignUp}
      />
    );
  }

  if (!appState) {
    return (
      <main className="loading-screen">
        <div className="loading-spinner" />
        <p>Carregando dados...</p>
      </main>
    );
  }

  // ═══════════════════════════════════════════
  // DERIVED STATE
  // ═══════════════════════════════════════════

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
      ? 'Alterações pendentes'
      : saveStatus === 'saving'
        ? 'Salvando...'
        : `Salvo ${formatSavedAt(lastSavedAt)}`;
  const isSupabaseConfigured = hasSupabaseConfig(appState.supabase);

  // ═══════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════

  const renderScreen = () => {
    switch (activeScreen) {
      case 'dashboard':
        return (
          <DashboardScreen
            appState={appState}
            activeWeekSummary={activeWeekSummary}
            activeWorkoutSummary={activeWorkoutSummary}
            activeProgress={activeProgress}
            activeCompletion={activeCompletion}
            saveStatus={saveStatus}
            saveStatusLabel={saveStatusLabel}
            formatMetric={formatMetric}
            onNavigateToWorkout={() => setActiveScreen('workout')}
          />
        );

      case 'workout':
        return (
          <WorkoutScreen
            appState={appState}
            activeEntries={activeEntries}
            activeWorkout={activeWorkout}
            getWeekSummary={getWeekSummary}
            onWeekChange={(weekIndex) => {
              updateState((currentState) => ({
                ...currentState,
                activeWeekIndex: weekIndex
              }));
            }}
            onWorkoutChange={(workoutId) => {
              updateState((currentState) => ({
                ...currentState,
                activeWorkoutId: workoutId
              }));
            }}
            workoutStartedAt={workoutStartedAt}
            workoutEndedAt={workoutEndedAt}
            workoutElapsedSeconds={workoutElapsedSeconds}
            activeExerciseTimer={activeExerciseTimer}
            now={now}
            restDurationSeconds={restDurationSeconds}
            restRemainingSeconds={restRemainingSeconds}
            saveStatus={saveStatus}
            formatMetric={formatMetric}
            formatDuration={formatDuration}
            getSetTypeLabel={getSetTypeLabel}
            onSetValueChange={updateSetValue}
            onWorkoutStart={() => {
              setWorkoutStartedAt(Date.now());
              setWorkoutEndedAt(null);
            }}
            onWorkoutEnd={() => setWorkoutEndedAt(Date.now())}
            onExerciseTimerToggle={(exerciseId) => {
              setActiveExerciseTimer((currentValue) =>
                currentValue?.exerciseId === exerciseId ? null : { exerciseId, startedAt: Date.now() }
              );
            }}
            onRestDurationChange={setRestDurationSeconds}
            onRestStart={() => setRestEndsAt(Date.now() + restDurationSeconds * 1000)}
            onRestReset={() => setRestEndsAt(null)}
            onSave={() => void handleSubmitWorkout()}
            onCopyPrevious={handleCopyPreviousWeek}
            onClearWeek={handleClearWeek}
          />
        );

      case 'feedback':
        return (
          <FeedbackScreen
            activeWeekLabel={activeWeek.label}
            activeWeekIndex={appState.activeWeekIndex}
            questions={FEEDBACK_QUESTIONS}
            activeFeedbackAnswers={activeFeedbackAnswers}
            weeklyComment={feedbackState.weeklyComments[appState.activeWeekIndex] ?? ''}
            feedbackState={feedbackState}
            onAnswerChange={updateFeedbackAnswer}
            onCommentChange={updateFeedbackComment}
            onPhotoNoteChange={updatePhotoNote}
          />
        );

      case 'media':
        return (
          <MediaScreen
            activeMedia={activeMedia}
            onAddMedia={(files) => void handleAddMedia(files)}
            onRemoveMedia={handleRemoveMedia}
            formatBytes={formatBytes}
          />
        );

      case 'settings':
        return (
          <SettingsScreen
            appState={appState}
            supabaseUserEmail={supabaseUserEmail}
            isSupabaseConfigured={isSupabaseConfigured}
            isSupabaseBusy={isSupabaseBusy}
            supabaseStatus={supabaseStatus}
            isExportingWorkbook={isExportingWorkbook}
            isExportingPdf={isExportingPdf}
            isSheetPreviewVisible={isSheetPreviewVisible}
            workbookCellValues={workbookCellValues}
            workbookLayout={workbookLayout}
            feedbackState={feedbackState}
            feedbackQuestions={FEEDBACK_QUESTIONS}
            pdfExportRef={pdfExportRef}
            onToggleSync={(enabled) => {
              updateState((currentState) => ({
                ...currentState,
                supabase: {
                  enabled,
                  projectUrl: currentState.supabase?.projectUrl ?? '',
                  anonKey: currentState.supabase?.anonKey ?? ''
                }
              }));
            }}
            onPushToSupabase={() => void handlePushToSupabase()}
            onPullFromSupabase={() => void handlePullFromSupabase()}
            onSupabaseSignOut={() => void handleSupabaseSignOut()}
            onExportWorkbook={() => void handleExportWorkbook()}
            onExportPdf={() => void handleExportPdf()}
            onToggleSheetPreview={() => setIsSheetPreviewVisible((v) => !v)}
            onChangeTheme={(theme) => updateState((s) => ({ ...s, theme }))}
            onLogout={() => void handleLogout()}
          />
        );
    }
  };

  return (
    <main className="app-shell">
      <header className="app-header">
        <div className="app-header-info">
          <h1>{activeWorkout.name}</h1>
          <p>
            {activeWeek.label} · {activeCompletion.completed}/{activeCompletion.total} séries
          </p>
        </div>
        <div className="app-header-actions">
          <span className={`save-indicator save-indicator--${saveStatus}`} />
        </div>
      </header>

      {flashMessage ? <div className="toast">{flashMessage}</div> : null}

      {renderScreen()}

      <BottomNav activeScreen={activeScreen} onNavigate={setActiveScreen} />
    </main>
  );
}

export default App;
