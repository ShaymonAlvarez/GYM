import { useEffect, useRef, useState, useMemo } from 'react';
import LoginScreen from './components/LoginScreen';
import BottomNav from './components/BottomNav';
import type { ScreenId } from './components/BottomNav';
import DashboardScreen from './components/DashboardScreen';
import WorkoutScreen from './components/WorkoutScreen';
import FeedbackScreen from './components/FeedbackScreen';
import HistoryScreen from './components/HistoryScreen';
import MediaScreen from './components/MediaScreen';
import SettingsScreen from './components/SettingsScreen';

import { FEEDBACK_QUESTIONS, FEEDBACK_WEEK_COUNT, normalizeFeedbackState, createEmptyFeedbackState } from './data/feedback';
import { lookupExerciseVideo } from './data/exerciseCatalog';
import sheetLayout from './data/sheetLayout.json';
import { loadAppState, saveAppState, clearAppState } from './lib/db';
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
import { parseWorkoutPdf } from './lib/pdfParser';
import {
  supabaseSingleton,
  hasSupabaseConfig,
  deleteRemoteAppState,
  uploadPhotoAsset
} from './lib/supabase';
import type { AppState, LocalMediaAsset, SheetLayout, ArchivedPeriod, SetEntry } from './types';

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


const readFileAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });


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
  const [workoutTimerPaused, setWorkoutTimerPaused] = useState(false);
  const [workoutTimerAccumulated, setWorkoutTimerAccumulated] = useState(0);
  const [activeSetTimer, setActiveSetTimer] = useState<{
    exerciseId: string;
    slotIndex: number;
    startedAt: number;
    accumulated: number;
    paused: boolean;
  } | null>(null);
  const [restDurationSeconds, setRestDurationSeconds] = useState(90);
  const [restTimer, setRestTimer] = useState<{
    exerciseId: string;
    slotIndex: number;
    startedAt: number;
    duration: number;
  } | null>(null);
  const [supabaseUserEmail, setSupabaseUserEmail] = useState<string | null>(null);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loginStatus, setLoginStatus] = useState('');
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

  // When the rest countdown runs out on its own, record the FULL prescribed duration.
  useEffect(() => {
    if (!restTimer) return;
    if (now >= restTimer.startedAt + restTimer.duration * 1000) {
      updateState((s) => patchSet(s, restTimer.exerciseId, restTimer.slotIndex, { restSeconds: restTimer.duration }));
      setRestTimer(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [now, restTimer]);

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
        const { createEmptyAppState } = await import('./data/seedData');
        const nextState = savedState && isAppState(savedState) ? normalizeAppState(savedState) : createEmptyAppState();
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

  const handleImportPdf = async (file: File) => {
    const confirmMessage = "Tem certeza que deseja importar este PDF? Seu progresso atual será salvo no Histórico e a tela de treinos será totalmente resetada e substituída pelo novo plano.";
    if (!window.confirm(confirmMessage)) return;

    try {
      const parsedTemplates = await parseWorkoutPdf(file);
      if (!parsedTemplates.length) {
        alert("Nenhum treino reconhecido no PDF.");
        return;
      }

      // Mapeia cada exercício para a linha absoluta correta da planilha modelo.
      // A planilha tem grupos fixos separados por linha amarela:
      // Treino 1 -> linhas 5-9, Treino 2 -> 11-15, Treino 3 -> 17-21, Treino 4 -> 23-27.
      const EXERCISE_GROUP_START_ROWS = [5, 11, 17, 23];
      const GROUP_CAPACITY = 5;
      const templates = parsedTemplates
        .slice(0, EXERCISE_GROUP_START_ROWS.length)
        .map((template, workoutIndex) => ({
          ...template,
          exercises: template.exercises.slice(0, GROUP_CAPACITY).map((exercise, exerciseIndex) => ({
            ...exercise,
            ...lookupExerciseVideo(exercise.name),
            rowNumber: EXERCISE_GROUP_START_ROWS[workoutIndex] + exerciseIndex
          }))
        }));

      updateState((currentState) => {
        const archivedPeriod: ArchivedPeriod = {
          id: `archive-${Date.now()}`,
          archivedAt: new Date().toISOString(),
          label: `Período arquivado em ${new Date().toLocaleDateString()}`,
          state: { ...currentState, archives: undefined }
        };
        
        return {
          ...currentState,
          templates,
          weeks: Array.from({ length: FEEDBACK_WEEK_COUNT }, (_, i) => ({
            index: i,
            label: `Semana ${i + 1}`,
            workoutLogs: [],
            isCompleted: false
          })),
          activeWeekIndex: 0,
          activeWorkoutId: templates[0]?.id ?? '',
          feedback: createEmptyFeedbackState(),
          archives: [...(currentState.archives || []), archivedPeriod]
        };
      });
      setFlashMessage("Treino importado com sucesso!");
    } catch (e) {
      console.error(e);
      alert("Erro ao ler o PDF.");
    }
  };

  // ═══════════════════════════════════════════
  // LOGIN HANDLERS
  // ═══════════════════════════════════════════

  const friendlyAuthError = (error: unknown): string => {
    const msg = error instanceof Error ? error.message.toLowerCase() : '';
    if (msg.includes('invalid login credentials') || msg.includes('invalid credentials')) {
      return 'Email ou senha incorretos.';
    }
    if (msg.includes('email not confirmed')) {
      return 'Confirme seu email antes de entrar. Verifique a caixa de entrada.';
    }
    if (msg.includes('user already registered') || msg.includes('already been registered')) {
      return 'Este email já possui uma conta. Tente entrar.';
    }
    if (msg.includes('password should be at least') || msg.includes('weak password')) {
      return 'A senha deve ter pelo menos 6 caracteres.';
    }
    if (msg.includes('invalid email') || msg.includes('unable to validate email')) {
      return 'Endereço de email inválido.';
    }
    if (msg.includes('too many requests') || msg.includes('rate limit')) {
      return 'Muitas tentativas. Aguarde alguns minutos e tente novamente.';
    }
    if (msg.includes('network') || msg.includes('fetch')) {
      return 'Sem conexão com a internet. Verifique sua rede.';
    }
    return 'Algo deu errado. Tente novamente.';
  };

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!supabaseClient) {
      setLoginError('Serviço temporariamente indisponível. Tente novamente em instantes.');
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

      if (error) throw error;

      setLoginPassword('');
      setIsAuthenticated(true);

      const savedState = await loadAppState();
      const { createEmptyAppState } = await import('./data/seedData');
      const nextState = savedState && isAppState(savedState) ? normalizeAppState(savedState) : createEmptyAppState();
      setAppState(nextState);
      if (!savedState || !isAppState(savedState)) {
        void saveAppState(nextState);
      }
    } catch (error) {
      setLoginError(friendlyAuthError(error));
    } finally {
      setIsLoginBusy(false);
    }
  };

  const handleSignUp = async () => {
    if (!supabaseClient) {
      setLoginError('Serviço temporariamente indisponível. Tente novamente em instantes.');
      return;
    }

    if (!loginEmail.trim()) {
      setLoginError('Informe seu email.');
      return;
    }
    if (loginPassword.length < 6) {
      setLoginError('A senha deve ter pelo menos 6 caracteres.');
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

      if (error) throw error;

      setLoginPassword('');
      setLoginStatus('Conta criada! Verifique seu email para confirmar o cadastro.');
    } catch (error) {
      setLoginError(friendlyAuthError(error));
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

  const handleClearLocalData = async () => {
    if (!window.confirm('Apaga TODOS os dados locais e do Supabase e encerra a sessão. Esta ação não pode ser desfeita. Continuar?')) return;

    if (supabaseClient) {
      const { data } = await supabaseClient.auth.getUser();
      if (data.user) {
        await deleteRemoteAppState(supabaseClient, data.user);
      }
      await supabaseClient.auth.signOut();
    }

    await clearAppState();
    window.location.reload();
  };

  const handleClearAllData = async () => {
    if (!window.confirm('Apaga TODOS os dados — local e no Supabase. O login é mantido. Esta ação não pode ser desfeita. Continuar?')) return;

    if (supabaseClient) {
      const { data } = await supabaseClient.auth.getUser();
      if (data.user) {
        await deleteRemoteAppState(supabaseClient, data.user);
      }
    }

    await clearAppState();
    window.location.reload();
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

  const clearFeedbackWeek = () => {
    updateState((currentState) => {
      const nextFeedback = normalizeFeedbackState(currentState.feedback, currentState.weeks.length);
      nextFeedback.weeklyAnswers[currentState.activeWeekIndex] = Array.from(
        { length: FEEDBACK_QUESTIONS.length },
        () => ''
      );
      return { ...currentState, feedback: nextFeedback };
    });
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

  const handleClearExercise = (exerciseId: string) => {
    if (!appState) return;
    updateState((currentState) => ({
      ...currentState,
      weeks: currentState.weeks.map((week) => {
        if (week.index !== currentState.activeWeekIndex) return week;
        return {
          ...week,
          workoutLogs: week.workoutLogs.map((workoutLog) => {
            if (workoutLog.workoutId !== currentState.activeWorkoutId) return workoutLog;
            const workoutTemplate = currentState.templates.find(
              (t) => t.id === currentState.activeWorkoutId
            );
            return {
              ...workoutLog,
              exerciseLogs: workoutLog.exerciseLogs.map((exerciseLog) => {
                if (exerciseLog.exerciseId !== exerciseId) return exerciseLog;
                const exerciseTemplate = workoutTemplate?.exercises.find(
                  (ex) => ex.id === exerciseId
                );
                return {
                  ...exerciseLog,
                  sets: exerciseTemplate ? createEmptySetEntries(exerciseTemplate) : exerciseLog.sets,
                  summary: { totalLoad: null, averageReps: null, setCount: 0 }
                };
              })
            };
          })
        };
      })
    }));
  };

  // Patch a single set in the active week/workout, recalculating the summary.
  const patchSet = (
    state: AppState,
    exerciseId: string,
    slotIndex: number,
    patch: Partial<SetEntry>
  ): AppState => ({
    ...state,
    weeks: state.weeks.map((week) => {
      if (week.index !== state.activeWeekIndex) return week;
      return {
        ...week,
        workoutLogs: week.workoutLogs.map((wl) => {
          if (wl.workoutId !== state.activeWorkoutId) return wl;
          return {
            ...wl,
            exerciseLogs: wl.exerciseLogs.map((el) => {
              if (el.exerciseId !== exerciseId) return el;
              const sets = el.sets.map((set) =>
                set.slotIndex === slotIndex ? { ...set, ...patch } : set
              );
              return { ...el, sets, summary: calculateSummaryFromSets({ sets }) };
            })
          };
        })
      };
    })
  });

  const handleWorkoutPauseToggle = () => {
    if (!workoutStartedAt || workoutEndedAt) return;
    if (workoutTimerPaused) {
      setWorkoutStartedAt(Date.now());
      setWorkoutTimerPaused(false);
    } else {
      const elapsed = Math.floor((Date.now() - workoutStartedAt) / 1000);
      setWorkoutTimerAccumulated((prev) => prev + elapsed);
      setWorkoutTimerPaused(true);
    }
  };

  const handleWorkoutEnd = () => {
    const endTime = Date.now();
    const runningElapsed = !workoutTimerPaused && workoutStartedAt
      ? Math.floor((endTime - workoutStartedAt) / 1000)
      : 0;
    const totalSeconds = workoutTimerAccumulated + runningElapsed;
    const todayIso = new Date().toISOString().slice(0, 10);
    setWorkoutEndedAt(endTime);
    updateState((s) => ({
      ...s,
      weeks: s.weeks.map((week) => {
        if (week.index !== s.activeWeekIndex) return week;
        return {
          ...week,
          workoutLogs: week.workoutLogs.map((wl) => {
            if (wl.workoutId !== s.activeWorkoutId) return wl;
            return { ...wl, durationSeconds: totalSeconds };
          })
        };
      }),
      workoutSessions: [
        ...(s.workoutSessions ?? []).filter((sess) => sess.date !== todayIso),
        { date: todayIso, durationSeconds: totalSeconds }
      ]
    }));
  };

  const handleEditSession = (date: string, durationSeconds: number) => {
    updateState((s) => ({
      ...s,
      workoutSessions: [
        ...(s.workoutSessions ?? []).filter((sess) => sess.date !== date),
        { date, durationSeconds }
      ]
    }));
  };

  const handleResetTimer = () => {
    const todayIso = new Date().toISOString().slice(0, 10);
    setWorkoutStartedAt(null);
    setWorkoutEndedAt(null);
    setWorkoutTimerPaused(false);
    setWorkoutTimerAccumulated(0);
    updateState((s) => ({
      ...s,
      workoutSessions: (s.workoutSessions ?? []).filter((sess) => sess.date !== todayIso)
    }));
  };

  // Records the actual elapsed rest for the set the rest timer belongs to.
  const recordRestElapsed = (timer: { exerciseId: string; slotIndex: number; startedAt: number; duration: number }) => {
    const elapsed = Math.min(timer.duration, Math.floor((Date.now() - timer.startedAt) / 1000));
    updateState((s) => patchSet(s, timer.exerciseId, timer.slotIndex, { restSeconds: elapsed }));
  };

  // Start / pause / resume the ACTIVE (count-up) timer. Never touches the rest timer.
  const handleSetTimerToggle = (exerciseId: string, slotIndex: number) => {
    if (activeSetTimer?.exerciseId === exerciseId && activeSetTimer?.slotIndex === slotIndex) {
      if (activeSetTimer.paused) {
        // Resume: continue counting from where it froze
        setActiveSetTimer({ ...activeSetTimer, paused: false, startedAt: Date.now() });
      } else {
        // Pause: freeze the chronometer only — no rest, nothing recorded
        const elapsed = Math.floor((Date.now() - activeSetTimer.startedAt) / 1000);
        setActiveSetTimer({ ...activeSetTimer, paused: true, accumulated: activeSetTimer.accumulated + elapsed });
      }
    } else {
      // Starting a new set's timer: if a rest was running, bank its elapsed time first
      if (restTimer) {
        recordRestElapsed(restTimer);
        setRestTimer(null);
      }
      setActiveSetTimer({ exerciseId, slotIndex, startedAt: Date.now(), accumulated: 0, paused: false });
    }
  };

  // Finalize the ACTIVE timer: record the total active time, then auto-start the rest countdown.
  const handleFinalizeSet = (exerciseId: string, slotIndex: number) => {
    if (!activeSetTimer) return;
    const totalSeconds = activeSetTimer.paused
      ? activeSetTimer.accumulated
      : activeSetTimer.accumulated + Math.floor((Date.now() - activeSetTimer.startedAt) / 1000);
    updateState((s) => patchSet(s, exerciseId, slotIndex, { activeSeconds: totalSeconds }));
    setActiveSetTimer(null);
    setRestTimer({ exerciseId, slotIndex, startedAt: Date.now(), duration: restDurationSeconds });
  };

  // Finalize the REST countdown early: record only the rest that actually elapsed.
  const handleFinishRest = () => {
    if (!restTimer) return;
    recordRestElapsed(restTimer);
    setRestTimer(null);
  };

  const handleClearSet = (exerciseId: string, slotIndex: number) => {
    updateState((s) => ({
      ...s,
      weeks: s.weeks.map((week) => {
        if (week.index !== s.activeWeekIndex) return week;
        return {
          ...week,
          workoutLogs: week.workoutLogs.map((wl) => {
            if (wl.workoutId !== s.activeWorkoutId) return wl;
            return {
              ...wl,
              exerciseLogs: wl.exerciseLogs.map((el) => {
                if (el.exerciseId !== exerciseId) return el;
                const nextSets = el.sets.map((set) =>
                  set.slotIndex === slotIndex
                    ? { ...set, load: '', reps: '', activeSeconds: undefined }
                    : set
                );
                return { ...el, sets: nextSets, summary: calculateSummaryFromSets({ sets: nextSets }) };
              })
            };
          })
        };
      })
    }));
  };

  const handleClearExerciseForWeek = (exerciseId: string, weekIndex: number) => {
    updateState((s) => ({
      ...s,
      weeks: s.weeks.map((week) => {
        if (week.index !== weekIndex) return week;
        const template = s.templates.find((t) => t.id === s.activeWorkoutId);
        const exerciseTemplate = template?.exercises.find((ex) => ex.id === exerciseId);
        return {
          ...week,
          workoutLogs: week.workoutLogs.map((wl) => {
            if (wl.workoutId !== s.activeWorkoutId) return wl;
            return {
              ...wl,
              exerciseLogs: wl.exerciseLogs.map((el) => {
                if (el.exerciseId !== exerciseId) return el;
                const emptySets = exerciseTemplate
                  ? createEmptySetEntries(exerciseTemplate)
                  : el.sets.map((set) => ({ ...set, load: '', reps: '', activeSeconds: undefined }));
                return { ...el, sets: emptySets, summary: { totalLoad: null, averageReps: null, setCount: 0 } };
              })
            };
          })
        };
      })
    }));
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

          // Always auto-upload photos when logged in — no manual push needed.
          if (asset.type !== 'photo' || !supabaseClient) {
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

  const handleSupabaseSignOut = async () => {
    if (!supabaseClient) return;
    await supabaseClient.auth.signOut();
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

  const EMPTY_WEEK: typeof appState.weeks[number] = { index: 0, label: 'Semana 1', workoutLogs: [] };
  const EMPTY_WORKOUT: typeof appState.templates[number] = { id: '', name: '', subtitle: '', accent: '', exercises: [] };
  const EMPTY_WORKOUT_LOG: import('./types').WorkoutLog = { workoutId: '', exerciseLogs: [] };

  const activeWeek = appState.weeks[appState.activeWeekIndex] ?? appState.weeks[0] ?? EMPTY_WEEK;
  const activeWorkout =
    appState.templates.find((workout) => workout.id === appState.activeWorkoutId) ?? appState.templates[0] ?? EMPTY_WORKOUT;
  const activeWorkoutLog =
    activeWeek.workoutLogs.find((workoutLog) => workoutLog.workoutId === activeWorkout.id) ??
    activeWeek.workoutLogs[0] ??
    EMPTY_WORKOUT_LOG;
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
  const workoutElapsedSeconds = (() => {
    if (!workoutStartedAt) return 0;
    if (workoutTimerPaused) return workoutTimerAccumulated;
    return workoutTimerAccumulated + Math.floor(((workoutEndedAt ?? now) - workoutStartedAt) / 1000);
  })();
  const restRemainingSeconds = restTimer
    ? Math.max(0, Math.ceil((restTimer.startedAt + restTimer.duration * 1000 - now) / 1000))
    : 0;

  const saveStatusLabel =
    saveStatus === 'dirty'
      ? 'Alterações pendentes'
      : saveStatus === 'saving'
        ? 'Salvando...'
        : `Salvo ${formatSavedAt(lastSavedAt)}`;
  const isSupabaseConfigured = hasSupabaseConfig(appState.supabase);

  // Extra dashboard metrics
  const previousWeek = appState.activeWeekIndex > 0
    ? appState.weeks[appState.activeWeekIndex - 1]
    : null;
  const previousWeekSummary = previousWeek ? getWeekSummary(previousWeek) : null;

  const workoutsThisWeek = activeWeek.workoutLogs.filter((wl) =>
    wl.exerciseLogs.some((el) => el.sets.some((s) => s.load || s.reps))
  ).length;

  // ═══════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════

  const hasProgram = appState.templates.length > 0;

  const emptyProgramScreen = (
    <div className="screen">
      <div className="empty-program-state">
        <svg className="empty-program-state__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 17H5a2 2 0 0 0-2 2v0a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v0a2 2 0 0 0-2-2h-4"/>
          <path d="M12 3v14"/>
          <path d="M8 7l4-4 4 4"/>
        </svg>
        <h2 className="empty-program-state__title">Nenhum treino carregado</h2>
        <p className="empty-program-state__subtitle">Importe o PDF do seu plano de treino para começar.</p>
        <button
          type="button"
          className="btn btn--primary"
          onClick={() => setActiveScreen('settings')}
        >
          Importar PDF
        </button>
      </div>
    </div>
  );

  const renderScreen = () => {
    switch (activeScreen) {
      case 'dashboard':
        if (!hasProgram) return emptyProgramScreen;
        return (
          <DashboardScreen
            appState={appState}
            activeWeekSummary={activeWeekSummary}
            activeWorkoutSummary={activeWorkoutSummary}
            previousWeekSummary={previousWeekSummary}
            workoutsThisWeek={workoutsThisWeek}
            activeProgress={activeProgress}
            activeCompletion={activeCompletion}
            saveStatus={saveStatus}
            saveStatusLabel={saveStatusLabel}
            formatMetric={formatMetric}
            onNavigateToWorkout={() => setActiveScreen('workout')}
          />
        );

      case 'workout':
        if (!hasProgram) return emptyProgramScreen;
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
            activeSetTimer={activeSetTimer}
            restTimer={restTimer}
            now={now}
            restDurationSeconds={restDurationSeconds}
            restRemainingSeconds={restRemainingSeconds}
            saveStatus={saveStatus}
            formatMetric={formatMetric}
            formatDuration={formatDuration}
            onSetValueChange={updateSetValue}
            workoutTimerPaused={workoutTimerPaused}
            workoutSessions={appState.workoutSessions ?? []}
            onWorkoutStart={() => {
              setWorkoutStartedAt(Date.now());
              setWorkoutEndedAt(null);
              setWorkoutTimerPaused(false);
              setWorkoutTimerAccumulated(0);
            }}
            onWorkoutEnd={handleWorkoutEnd}
            onWorkoutPauseToggle={handleWorkoutPauseToggle}
            onEditSession={handleEditSession}
            onResetTimer={handleResetTimer}
            onSetTimerToggle={handleSetTimerToggle}
            onFinalizeSet={handleFinalizeSet}
            onClearSet={handleClearSet}
            onRestDurationChange={setRestDurationSeconds}
            onFinishRest={handleFinishRest}
            onSave={() => void handleSubmitWorkout()}
            onCopyPrevious={handleCopyPreviousWeek}
            onClearWeek={handleClearWeek}
            onClearExercise={handleClearExercise}
            onClearExerciseForWeek={handleClearExerciseForWeek}
          />
        );

      case 'feedback':
        if (!hasProgram) return emptyProgramScreen;
        return (
          <FeedbackScreen
            appState={appState}
            questions={FEEDBACK_QUESTIONS}
            activeFeedbackAnswers={activeFeedbackAnswers}
            weeklyComment={feedbackState.weeklyComments[appState.activeWeekIndex] ?? ''}
            feedbackState={feedbackState}
            onAnswerChange={updateFeedbackAnswer}
            onCommentChange={updateFeedbackComment}
            onPhotoNoteChange={updatePhotoNote}
            onWeekChange={(weekIndex) => updateState((s) => ({ ...s, activeWeekIndex: weekIndex }))}
            onClearFeedback={clearFeedbackWeek}
          />
        );

      case 'history':
        return <HistoryScreen appState={appState} />;

      case 'media':
        if (!hasProgram) return emptyProgramScreen;
        return (
          <MediaScreen
            appState={appState}
            activeWorkout={activeWorkout}
            activeMedia={activeMedia}
            onAddMedia={(files) => void handleAddMedia(files)}
            onRemoveMedia={handleRemoveMedia}
            onWeekChange={(weekIndex) => updateState((s) => ({ ...s, activeWeekIndex: weekIndex }))}
            onWorkoutChange={(workoutId) => updateState((s) => ({ ...s, activeWorkoutId: workoutId }))}
            formatBytes={formatBytes}
          />
        );

      case 'settings':
        return (
          <SettingsScreen
            appState={appState}
            supabaseUserEmail={supabaseUserEmail}
            isSupabaseConfigured={isSupabaseConfigured}
            isExportingWorkbook={isExportingWorkbook}
            isExportingPdf={isExportingPdf}
            isSheetPreviewVisible={isSheetPreviewVisible}
            workbookCellValues={workbookCellValues}
            workbookLayout={workbookLayout}
            feedbackState={feedbackState}
            feedbackQuestions={FEEDBACK_QUESTIONS}
            pdfExportRef={pdfExportRef}
            onSupabaseSignOut={() => void handleSupabaseSignOut()}
            onExportWorkbook={() => void handleExportWorkbook()}
            onExportPdf={() => void handleExportPdf()}
            onToggleSheetPreview={() => setIsSheetPreviewVisible((v) => !v)}
            onChangeTheme={(theme) => updateState((s) => ({ ...s, theme }))}
            onToggleHideWarmupSets={(hide) => updateState((s) => ({ ...s, preferences: { ...s.preferences, hideWarmupSets: hide } }))}
            onImportPdf={handleImportPdf}
            onClearLocalData={() => void handleClearLocalData()}
            onClearAllData={() => void handleClearAllData()}
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
