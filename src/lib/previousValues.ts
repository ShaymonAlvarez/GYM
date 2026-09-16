import type { AccessoryKind, AppState, SetEntry, WeekLog, WorkoutTemplate } from '../types';

export type PreviousSetValue = { load: string; reps: string };

type Occurrence = { sets: SetEntry[] };

export const normalizeExerciseName = (name: string) => name.replace(/\s+/g, ' ').trim().toUpperCase();

const hasValue = (set: SetEntry) => Boolean(set.load.trim() || set.reps.trim());

/**
 * Registros do mesmo exercício (por nome), do mais recente para o mais antigo:
 * treinos anteriores da semana ativa, depois semanas anteriores do bloco e, por
 * fim, os blocos arquivados. Assim a Cadeira Extensora do Treino A alimenta a do C.
 */
const collectOccurrences = (
  state: Pick<AppState, 'templates' | 'weeks' | 'archives'>,
  weekIndex: number,
  workoutId: string,
  exerciseName: string
): Occurrence[] => {
  const targetName = normalizeExerciseName(exerciseName);
  const occurrences: Occurrence[] = [];

  const collectFromWeek = (week: WeekLog | undefined, workouts: WorkoutTemplate[]) => {
    if (!week) return;
    [...workouts].reverse().forEach((workout) => {
      const workoutLog = week.workoutLogs.find((log) => log.workoutId === workout.id);
      workout.exercises
        .filter((exercise) => normalizeExerciseName(exercise.name) === targetName)
        .forEach((exercise) => {
          const exerciseLog = workoutLog?.exerciseLogs.find((log) => log.exerciseId === exercise.id);
          if (exerciseLog) occurrences.push({ sets: exerciseLog.sets });
        });
    });
  };

  const templates = state.templates;
  const workoutPosition = templates.findIndex((workout) => workout.id === workoutId);
  collectFromWeek(state.weeks[weekIndex], workoutPosition > 0 ? templates.slice(0, workoutPosition) : []);

  for (let index = weekIndex - 1; index >= 0; index -= 1) {
    collectFromWeek(state.weeks[index], templates);
  }

  [...(state.archives ?? [])].reverse().forEach((archive) => {
    const archivedTemplates = archive.state.templates ?? [];
    const archivedWeeks = archive.state.weeks ?? [];
    for (let index = archivedWeeks.length - 1; index >= 0; index -= 1) {
      collectFromWeek(archivedWeeks[index], archivedTemplates);
    }
  });

  return occurrences;
};

/**
 * Valor anterior de uma série: casa pelo tipo (aquecimento/laranja/vermelha) e pela
 * posição dentro desse tipo. Se o registro anterior tiver menos séries daquele tipo,
 * usa a última delas. Registros sem valor naquela série são ignorados.
 */
export const getPreviousSetValue = (
  state: Pick<AppState, 'templates' | 'weeks' | 'archives'>,
  weekIndex: number,
  workoutId: string,
  exerciseId: string,
  slotIndex: number
): PreviousSetValue | null => {
  const workout = state.templates.find((template) => template.id === workoutId);
  const exercise = workout?.exercises.find((entry) => entry.id === exerciseId);
  const currentSets = state.weeks[weekIndex]?.workoutLogs
    .find((log) => log.workoutId === workoutId)
    ?.exerciseLogs.find((log) => log.exerciseId === exerciseId)?.sets;
  const targetSet = currentSets?.find((set) => set.slotIndex === slotIndex);

  if (!exercise || !currentSets || !targetSet) return null;

  const ordinal = currentSets.filter((set) => set.type === targetSet.type).indexOf(targetSet);

  for (const occurrence of collectOccurrences(state, weekIndex, workoutId, exercise.name)) {
    const sameType = occurrence.sets.filter((set) => set.type === targetSet.type);
    const candidate = sameType[Math.min(ordinal, sameType.length - 1)];
    if (candidate && hasValue(candidate)) {
      return { load: candidate.load, reps: candidate.reps };
    }
  }

  return null;
};

/**
 * Último valor do bloco Abdômen/Panturrilha do mesmo tipo, na mesma ordem de busca
 * das séries: treinos anteriores da semana ativa, semanas anteriores e blocos arquivados.
 */
export const getPreviousAccessorySet = (
  state: Pick<AppState, 'templates' | 'weeks' | 'archives'>,
  weekIndex: number,
  workoutId: string,
  kind: AccessoryKind,
  setIndex: number
): PreviousSetValue | null => {
  const findInWeek = (week: WeekLog | undefined, workouts: WorkoutTemplate[]) => {
    for (const workout of [...workouts].reverse()) {
      const accessory = week?.workoutLogs.find((log) => log.workoutId === workout.id)?.extras?.accessory;
      const set = accessory?.kind === kind ? accessory.sets[setIndex] : undefined;
      if (set && (set.load.trim() || set.reps.trim())) return { load: set.load, reps: set.reps };
    }
    return null;
  };

  const templates = state.templates;
  const workoutPosition = templates.findIndex((workout) => workout.id === workoutId);
  const inWeek = findInWeek(state.weeks[weekIndex], workoutPosition > 0 ? templates.slice(0, workoutPosition) : []);
  if (inWeek) return inWeek;

  for (let index = weekIndex - 1; index >= 0; index -= 1) {
    const found = findInWeek(state.weeks[index], templates);
    if (found) return found;
  }

  for (const archive of [...(state.archives ?? [])].reverse()) {
    const archivedWeeks = archive.state.weeks ?? [];
    for (let index = archivedWeeks.length - 1; index >= 0; index -= 1) {
      const found = findInWeek(archivedWeeks[index], archive.state.templates ?? []);
      if (found) return found;
    }
  }

  return null;
};

export type ExerciseCommentEntry = { key: string; label: string; comment: string };

/**
 * Comentários já registrados para exercícios com o mesmo nome: semanas do bloco
 * atual (mais recentes primeiro) e blocos arquivados.
 */
export const collectExerciseComments = (
  state: Pick<AppState, 'templates' | 'weeks' | 'archives'>,
  exerciseName: string,
  weekCount: number
): ExerciseCommentEntry[] => {
  const targetName = normalizeExerciseName(exerciseName);
  const entries: ExerciseCommentEntry[] = [];

  const collect = (weeks: WeekLog[], workouts: WorkoutTemplate[], prefix: string, keyPrefix: string) => {
    for (let weekIndex = weeks.length - 1; weekIndex >= 0; weekIndex -= 1) {
      workouts.forEach((workout) => {
        const workoutLog = weeks[weekIndex].workoutLogs.find((log) => log.workoutId === workout.id);
        workout.exercises
          .filter((exercise) => normalizeExerciseName(exercise.name) === targetName)
          .forEach((exercise) => {
            const comment = workoutLog?.exerciseLogs.find((log) => log.exerciseId === exercise.id)?.comment?.trim();
            if (comment) {
              entries.push({
                key: `${keyPrefix}-${weekIndex}-${exercise.id}`,
                label: `${prefix}S${weekIndex + 1} · ${workout.name}`,
                comment
              });
            }
          });
      });
    }
  };

  collect(state.weeks.slice(0, weekCount), state.templates, '', 'current');
  [...(state.archives ?? [])].reverse().forEach((archive) => {
    const archivedAt = new Date(archive.archivedAt);
    const prefix = Number.isNaN(archivedAt.getTime())
      ? 'Bloco anterior · '
      : `Bloco até ${archivedAt.toLocaleDateString('pt-BR')} · `;
    collect(archive.state.weeks ?? [], archive.state.templates ?? [], prefix, archive.id);
  });

  return entries;
};

/** Preenche os campos vazios da série com o valor anterior (sem sobrescrever o que já foi digitado). */
export const fillSetFromPrevious = (set: SetEntry, previous: PreviousSetValue | null): SetEntry => {
  if (!previous) return set;
  return {
    ...set,
    load: set.load.trim() ? set.load : previous.load,
    reps: set.reps.trim() ? set.reps : previous.reps
  };
};
