import type { AppState, ExerciseLog, SetEntry, SummaryMetrics, WeekLog, WorkoutLog, WorkoutTemplate } from '../types';

type BackupPayload = {
  version: 1;
  exportedAt: string;
  state: AppState;
};

const parseNumber = (value: string): number | null => {
  const normalized = value.replace(',', '.').trim();

  if (!normalized) {
    return null;
  }

  const parsed = Number(normalized);

  return Number.isFinite(parsed) ? parsed : null;
};

export const sanitizeNumericInput = (value: string): string => {
  const normalized = value.replace(',', '.').replace(/[^0-9.]/g, '');
  const parts = normalized.split('.');

  if (parts.length <= 1) {
    return normalized;
  }

  return `${parts[0]}.${parts.slice(1).join('')}`;
};

export const createEmptySets = (setCount: number): SetEntry[] =>
  Array.from({ length: setCount }, () => ({ load: '', reps: '' }));

export const cloneWeek = (week: WeekLog, label: string): WeekLog => ({
  ...structuredClone(week),
  id: crypto.randomUUID(),
  label,
  createdAt: new Date().toISOString()
});

export const nextWeekLabel = (weeks: WeekLog[]): string => {
  const highestIndex = weeks.reduce((highest, week) => {
    const match = week.label.match(/(\d+)/);
    const numericLabel = match ? Number(match[1]) : 0;

    return Number.isFinite(numericLabel) ? Math.max(highest, numericLabel) : highest;
  }, 0);

  return `Semana ${highestIndex + 1}`;
};

const accumulateSummary = (summary: SummaryMetrics, setEntry: SetEntry): SummaryMetrics => {
  const load = parseNumber(setEntry.load);
  const reps = parseNumber(setEntry.reps);
  const nextSummary = { ...summary };

  if (load !== null && reps !== null) {
    nextSummary.totalLoad += load * reps;
  }

  if (reps !== null) {
    nextSummary.averageReps += reps;
    nextSummary.setCount += 1;
  }

  return nextSummary;
};

export const getExerciseSummary = (exerciseLog: ExerciseLog): SummaryMetrics => {
  const rawSummary = exerciseLog.sets.reduce(accumulateSummary, {
    totalLoad: 0,
    averageReps: 0,
    setCount: 0
  });

  return {
    totalLoad: rawSummary.totalLoad,
    averageReps: rawSummary.setCount > 0 ? rawSummary.averageReps / rawSummary.setCount : 0,
    setCount: rawSummary.setCount
  };
};

export const getWorkoutSummary = (workoutLog: WorkoutLog): SummaryMetrics => {
  const combined = workoutLog.exerciseLogs.reduce(
    (summary, exerciseLog) => {
      const next = getExerciseSummary(exerciseLog);

      return {
        totalLoad: summary.totalLoad + next.totalLoad,
        averageReps: summary.averageReps + next.averageReps * next.setCount,
        setCount: summary.setCount + next.setCount
      };
    },
    {
      totalLoad: 0,
      averageReps: 0,
      setCount: 0
    }
  );

  return {
    totalLoad: combined.totalLoad,
    averageReps: combined.setCount > 0 ? combined.averageReps / combined.setCount : 0,
    setCount: combined.setCount
  };
};

export const getWeekSummary = (week: WeekLog): SummaryMetrics => {
  const combined = week.workoutLogs.reduce(
    (summary, workoutLog) => {
      const next = getWorkoutSummary(workoutLog);

      return {
        totalLoad: summary.totalLoad + next.totalLoad,
        averageReps: summary.averageReps + next.averageReps * next.setCount,
        setCount: summary.setCount + next.setCount
      };
    },
    {
      totalLoad: 0,
      averageReps: 0,
      setCount: 0
    }
  );

  return {
    totalLoad: combined.totalLoad,
    averageReps: combined.setCount > 0 ? combined.averageReps / combined.setCount : 0,
    setCount: combined.setCount
  };
};

export const formatMetric = (value: number, maximumFractionDigits = 1): string =>
  new Intl.NumberFormat('pt-BR', {
    maximumFractionDigits,
    minimumFractionDigits: value % 1 === 0 ? 0 : Math.min(1, maximumFractionDigits)
  }).format(value);

export const formatDateLabel = (isoDate: string): string =>
  new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'short'
  }).format(new Date(isoDate));

export const getDeltaTone = (
  currentValue: number,
  previousValue: number
): 'positive' | 'negative' | 'neutral' => {
  if (!previousValue || currentValue === previousValue) {
    return 'neutral';
  }

  return currentValue > previousValue ? 'positive' : 'negative';
};

export const getDeltaLabel = (currentValue: number, previousValue: number): string => {
  if (!previousValue) {
    return 'sem base';
  }

  const ratio = ((currentValue - previousValue) / previousValue) * 100;
  const prefix = ratio > 0 ? '+' : '';

  return `${prefix}${formatMetric(ratio, 0)}%`;
};

const looksLikeWorkoutTemplate = (value: unknown): value is WorkoutTemplate => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as WorkoutTemplate;

  return typeof candidate.id === 'string' && Array.isArray(candidate.exercises);
};

const looksLikeWeekLog = (value: unknown): value is WeekLog => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as WeekLog;

  return typeof candidate.id === 'string' && typeof candidate.label === 'string' && Array.isArray(candidate.workoutLogs);
};

const looksLikeAppState = (value: unknown): value is AppState => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as AppState;

  return (
    Array.isArray(candidate.templates) &&
    candidate.templates.every(looksLikeWorkoutTemplate) &&
    Array.isArray(candidate.weeks) &&
    candidate.weeks.every(looksLikeWeekLog) &&
    typeof candidate.activeWeekId === 'string' &&
    typeof candidate.activeWorkoutId === 'string'
  );
};

export const normalizeImportedState = (state: AppState): AppState => {
  const fallbackWeekId = state.weeks[0]?.id ?? '';
  const fallbackWorkoutId = state.templates[0]?.id ?? '';

  return {
    ...state,
    customizations:
      state.customizations && !Array.isArray(state.customizations) ? state.customizations : {},
    activeWeekId: state.weeks.some((week) => week.id === state.activeWeekId)
      ? state.activeWeekId
      : fallbackWeekId,
    activeWorkoutId: state.templates.some((template) => template.id === state.activeWorkoutId)
      ? state.activeWorkoutId
      : fallbackWorkoutId
  };
};

export const createBackupPayload = (state: AppState): BackupPayload => ({
  version: 1,
  exportedAt: new Date().toISOString(),
  state
});

export const readImportedState = (value: unknown): AppState | null => {
  if (looksLikeAppState(value)) {
    return normalizeImportedState(value);
  }

  if (value && typeof value === 'object' && 'state' in value) {
    const candidate = (value as BackupPayload).state;

    if (looksLikeAppState(candidate)) {
      return normalizeImportedState(candidate);
    }
  }

  return null;
};