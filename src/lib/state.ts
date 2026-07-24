import type {
  AppState,
  ExerciseLog,
  ExerciseSummary,
  SetEntry,
  SummaryMetrics,
  WeekLog,
  WorkoutLog,
  WorkoutTemplate
} from '../types';
import { MAX_WEEK_COUNT, normalizeFeedbackState } from '../data/feedback';

const parseNumber = (value: string): number | null => {
  const normalized = value.replace(',', '.').trim();

  if (!normalized) {
    return null;
  }

  const parsed = Number(normalized);

  return Number.isFinite(parsed) ? parsed : null;
};

const mergeSummary = (summary: SummaryMetrics, next: SummaryMetrics): SummaryMetrics => {
  if (next.totalLoad === null || next.averageReps === null || next.setCount === 0) {
    return summary;
  }

  return {
    totalLoad: (summary.totalLoad ?? 0) + next.totalLoad,
    averageReps: (summary.averageReps ?? 0) + next.averageReps * next.setCount,
    setCount: summary.setCount + next.setCount
  };
};

export const sanitizeNumericInput = (value: string): string => {
  const normalized = value.replace(',', '.').replace(/[^0-9.]/g, '');
  const parts = normalized.split('.');

  if (parts.length <= 1) {
    return normalized;
  }

  return `${parts[0]}.${parts.slice(1).join('')}`;
};

export const createSummary = (
  totalLoad: number | null,
  averageReps: number | null,
  setCount: number
): ExerciseSummary => ({
  totalLoad,
  averageReps,
  setCount
});

export const createEmptySetEntries = (
  template: WorkoutTemplate['exercises'][number],
  initialValues?: Record<number, { load: string; reps: string }>
): SetEntry[] =>
  template.activeSlotIndices.map((slotIndex, activeIndex) => ({
    slotIndex,
    type: (() => {
      if (template.yellowSetCount != null) {
        if (activeIndex < template.yellowSetCount) return 'yellow' as const;
        if (activeIndex < template.yellowSetCount + (template.orangeSetCount ?? 0)) return 'orange' as const;
        return 'red' as const;
      }
      if (slotIndex === 0) return 'yellow' as const;
      if (activeIndex < (template.orangeSetCount ?? 0)) return 'orange' as const;
      return 'red' as const;
    })(),
    load: initialValues?.[slotIndex]?.load ?? '',
    reps: initialValues?.[slotIndex]?.reps ?? ''
  }));

export const calculateSummaryFromSets = (
  exerciseLog: Pick<ExerciseLog, 'sets'>,
  hideWarmupSets = false
): SummaryMetrics => {
  const rawSummary = exerciseLog.sets.reduce<SummaryMetrics>(
    (summary, setEntry) => {
      if (hideWarmupSets && setEntry.type === 'yellow') {
        return summary;
      }

      const load = parseNumber(setEntry.load);
      const reps = parseNumber(setEntry.reps);

      return {
        totalLoad: load !== null && reps !== null ? (summary.totalLoad ?? 0) + load * reps : summary.totalLoad,
        averageReps: reps !== null ? (summary.averageReps ?? 0) + reps : summary.averageReps,
        setCount: reps !== null ? summary.setCount + 1 : summary.setCount
      };
    },
    {
      totalLoad: null,
      averageReps: null,
      setCount: 0
    }
  );

  if (!rawSummary.setCount) {
    return {
      totalLoad: null,
      averageReps: null,
      setCount: 0
    };
  }

  return {
    totalLoad: rawSummary.totalLoad,
    averageReps: rawSummary.averageReps !== null ? rawSummary.averageReps / rawSummary.setCount : null,
    setCount: rawSummary.setCount
  };
};

export const getExerciseSummary = (exerciseLog: ExerciseLog): SummaryMetrics => exerciseLog.summary;

export const getWorkoutSummary = (workoutLog: WorkoutLog): SummaryMetrics => {
  const combined = workoutLog.exerciseLogs.reduce<SummaryMetrics>(
    (summary, exerciseLog) => mergeSummary(summary, getExerciseSummary(exerciseLog)),
    {
      totalLoad: null,
      averageReps: null,
      setCount: 0
    }
  );

  if (!combined.setCount) {
    return {
      totalLoad: null,
      averageReps: null,
      setCount: 0
    };
  }

  return {
    totalLoad: combined.totalLoad,
    averageReps: combined.averageReps !== null ? combined.averageReps / combined.setCount : null,
    setCount: combined.setCount
  };
};

export const getWeekSummary = (week: WeekLog): SummaryMetrics => {
  const combined = week.workoutLogs.reduce<SummaryMetrics>(
    (summary, workoutLog) => mergeSummary(summary, getWorkoutSummary(workoutLog)),
    {
      totalLoad: null,
      averageReps: null,
      setCount: 0
    }
  );

  if (!combined.setCount) {
    return {
      totalLoad: null,
      averageReps: null,
      setCount: 0
    };
  }

  return {
    totalLoad: combined.totalLoad,
    averageReps: combined.averageReps !== null ? combined.averageReps / combined.setCount : null,
    setCount: combined.setCount
  };
};

export const formatMetric = (value: number | null, maximumFractionDigits = 1): string => {
  if (value === null) {
    return '—';
  }

  return new Intl.NumberFormat('pt-BR', {
    maximumFractionDigits,
    minimumFractionDigits: value % 1 === 0 ? 0 : Math.min(1, maximumFractionDigits)
  }).format(value);
};

export const formatWorkbookNumber = (value: number | null): string => {
  if (value === null) {
    return '';
  }

  return String(Number(value.toFixed(2))).replace(/\.00$/, '');
};

export const normalizeAppState = (state: AppState): AppState => {
  const weekCount = MAX_WEEK_COUNT;

  // Set counts come straight from the PDF parser (classified by RIR). No
  // hardcoded overrides — those fought the parser and corrupted new imports.
  const templates = state.templates;

  const weeks = state.weeks.slice(0, weekCount).map((week, weekIndex) => ({
    ...week,
    index: weekIndex,
    label: `Semana ${weekIndex + 1}`,
    workoutLogs: (() => {
      const existingLogs = week.workoutLogs.map((workoutLog) => {
        const workoutTemplate = templates.find((template) => template.id === workoutLog.workoutId);

        if (!workoutTemplate) {
          return workoutLog;
        }

        return {
          ...workoutLog,
          exerciseLogs: workoutLog.exerciseLogs.map((exerciseLog) => {
            const exerciseTemplate = workoutTemplate.exercises.find((exercise) => exercise.id === exerciseLog.exerciseId);

            if (!exerciseTemplate) {
              return exerciseLog;
            }

            const valuesBySlot = Object.fromEntries(
              exerciseLog.sets.map((setEntry) => [setEntry.slotIndex, { load: setEntry.load, reps: setEntry.reps }])
            );
            const sets = createEmptySetEntries(exerciseTemplate, valuesBySlot).map((set) => {
              const original = exerciseLog.sets.find((entry) => entry.slotIndex === set.slotIndex);
              if (
                original &&
                (original.activeSeconds !== undefined ||
                  original.restSeconds !== undefined ||
                  original.restTarget !== undefined)
              ) {
                return {
                  ...set,
                  activeSeconds: original.activeSeconds,
                  restSeconds: original.restSeconds,
                  restTarget: original.restTarget
                };
              }
              return set;
            });

            return {
              ...exerciseLog,
              sets,
              summary: calculateSummaryFromSets({ sets }, state.preferences?.hideWarmupSets)
            };
          })
        };
      });

      // Create empty workout logs for templates that don't have one
      const existingWorkoutIds = new Set(existingLogs.map((log) => log.workoutId));
      const missingLogs = templates
        .filter((template) => !existingWorkoutIds.has(template.id))
        .map((template): WorkoutLog => ({
          workoutId: template.id,
          exerciseLogs: template.exercises.map((exercise) => ({
            exerciseId: exercise.id,
            sets: createEmptySetEntries(exercise),
            summary: calculateSummaryFromSets({ sets: createEmptySetEntries(exercise) }, state.preferences?.hideWarmupSets)
          }))
        }));

      return [...existingLogs, ...missingLogs];
    })()
  }));

  if (state.preferences?.week7Enabled && weeks.length < MAX_WEEK_COUNT) {
    weeks.push({
      index: 6,
      label: 'Semana 7',
      workoutLogs: templates.map((template) => ({
        workoutId: template.id,
        exerciseLogs: template.exercises.map((exercise) => ({
          exerciseId: exercise.id,
          sets: createEmptySetEntries(exercise),
          summary: calculateSummaryFromSets(
            { sets: createEmptySetEntries(exercise) },
            state.preferences?.hideWarmupSets
          )
        }))
      }))
    });
  }

  const visibleWeekCount = state.preferences?.week7Enabled ? MAX_WEEK_COUNT : Math.min(6, weeks.length);

  return {
    ...state,
    templates,
    weeks,
    activeWeekIndex: Math.min(Math.max(state.activeWeekIndex, 0), Math.max(visibleWeekCount - 1, 0)),
    feedback: normalizeFeedbackState(state.feedback, weeks.length),
    localMedia: (state.localMedia ?? []).filter((asset) => asset.weekIndex < weeks.length),
    supabase: {
      enabled: state.supabase?.enabled ?? false,
      projectUrl: state.supabase?.projectUrl ?? '',
      anonKey: state.supabase?.anonKey ?? ''
    },
    theme: state.theme ?? 'dark',
    preferences: state.preferences ?? {}
  };
};

export const getVisibleWeeks = (state: Pick<AppState, 'weeks' | 'preferences'>) =>
  state.preferences?.week7Enabled ? state.weeks.slice(0, MAX_WEEK_COUNT) : state.weeks.slice(0, 6);

const looksLikeExerciseTemplate = (
  value: unknown
): value is WorkoutTemplate['exercises'][number] => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as WorkoutTemplate['exercises'][number];

  return (
    typeof candidate.id === 'string' &&
    typeof candidate.name === 'string' &&
    typeof candidate.rowNumber === 'number' &&
    Array.isArray(candidate.activeSlotIndices)
  );
};

const looksLikeWorkoutTemplate = (value: unknown): value is WorkoutTemplate => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as WorkoutTemplate;

  return (
    typeof candidate.id === 'string' &&
    typeof candidate.name === 'string' &&
    Array.isArray(candidate.exercises) &&
    candidate.exercises.every(looksLikeExerciseTemplate)
  );
};

const looksLikeSetEntry = (value: unknown): value is SetEntry => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as SetEntry;

  return (
    typeof candidate.slotIndex === 'number' &&
    (candidate.type === 'yellow' || candidate.type === 'orange' || candidate.type === 'red') &&
    typeof candidate.load === 'string' &&
    typeof candidate.reps === 'string'
  );
};

const looksLikeSummary = (value: unknown): value is ExerciseSummary => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as ExerciseSummary;

  return typeof candidate.setCount === 'number';
};

const looksLikeExerciseLog = (value: unknown): value is ExerciseLog => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as ExerciseLog;

  return (
    typeof candidate.exerciseId === 'string' &&
    Array.isArray(candidate.sets) &&
    candidate.sets.every(looksLikeSetEntry) &&
    looksLikeSummary(candidate.summary)
  );
};

const looksLikeWorkoutLog = (value: unknown): value is WorkoutLog => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as WorkoutLog;

  return (
    typeof candidate.workoutId === 'string' &&
    Array.isArray(candidate.exerciseLogs) &&
    candidate.exerciseLogs.every(looksLikeExerciseLog)
  );
};

const looksLikeWeekLog = (value: unknown): value is WeekLog => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as WeekLog;

  return (
    typeof candidate.index === 'number' &&
    typeof candidate.label === 'string' &&
    Array.isArray(candidate.workoutLogs) &&
    candidate.workoutLogs.every(looksLikeWorkoutLog)
  );
};

export const isAppState = (value: unknown): value is AppState => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as AppState;

  return (
    Array.isArray(candidate.templates) &&
    candidate.templates.every(looksLikeWorkoutTemplate) &&
    Array.isArray(candidate.weeks) &&
    candidate.weeks.every(looksLikeWeekLog) &&
    typeof candidate.activeWeekIndex === 'number' &&
    typeof candidate.activeWorkoutId === 'string'
  );
};
