import importedProgram from './importedProgram.json';
import type { AppState, SetEntry, WorkoutTemplate, WeekLog } from '../types';
import { createEmptySetEntries, createSummary } from '../lib/state';
import { createEmptyFeedbackState } from './feedback';

type ImportedExercise = {
  id: string;
  name: string;
  rowNumber: number;
  focus: string;
  cue: string;
  orangeSetCount: number;
  redSetCount: number;
  activeSlotIndices: number[];
  currentSets: Array<Pick<SetEntry, 'slotIndex' | 'load' | 'reps'>>;
  summaries: Array<{
    totalLoad: number | null;
    averageReps: number | null;
    setCount: number;
  }>;
  videoUrl?: string;
  thumbnailUrl?: string;
  catalogLabel?: string;
  catalogPage?: number;
};

type ImportedWorkout = {
  id: string;
  name: string;
  subtitle: string;
  accent: string;
  exercises: ImportedExercise[];
};

type ImportedProgram = {
  latestWeekIndex: number;
  workouts: ImportedWorkout[];
};

const program = importedProgram as ImportedProgram;

export const seedTemplates: WorkoutTemplate[] = program.workouts.map((workout) => ({
  id: workout.id,
  name: workout.name,
  subtitle: workout.subtitle,
  accent: workout.accent,
  exercises: workout.exercises.map((exercise) => ({
    id: exercise.id,
    name: exercise.name,
    rowNumber: exercise.rowNumber,
    focus: exercise.focus,
    cue: exercise.cue,
    orangeSetCount: exercise.orangeSetCount,
    redSetCount: exercise.redSetCount,
    activeSlotIndices: exercise.activeSlotIndices,
    videoUrl: exercise.videoUrl,
    thumbnailUrl: exercise.thumbnailUrl,
    catalogLabel: exercise.catalogLabel,
    catalogPage: exercise.catalogPage
  }))
}));

const createInitialWeeks = (): WeekLog[] =>
  Array.from({ length: 7 }, (_, weekIndex) => ({
    index: weekIndex,
    label: `Semana ${weekIndex + 1}`,
    workoutLogs: program.workouts.map((workout, workoutIndex) => ({
      workoutId: workout.id,
      exerciseLogs: workout.exercises.map((exercise, exerciseIndex) => {
        const template = seedTemplates[workoutIndex].exercises[exerciseIndex];
        const initialValues =
          weekIndex === program.latestWeekIndex
            ? Object.fromEntries(
                exercise.currentSets.map((setEntry) => [
                  setEntry.slotIndex,
                  { load: setEntry.load, reps: setEntry.reps }
                ])
              )
            : undefined;
        const summary = exercise.summaries[weekIndex] ?? createSummary(null, null, template.activeSlotIndices.length);

        return {
          exerciseId: exercise.id,
          sets: createEmptySetEntries(template, initialValues),
          summary: createSummary(summary.totalLoad, summary.averageReps, template.activeSlotIndices.length)
        };
      })
    }))
  }));

export const createSeedAppState = (): AppState => {
  const weeks = createInitialWeeks();

  return {
    templates: seedTemplates,
    weeks,
    activeWeekIndex: program.latestWeekIndex,
    activeWorkoutId: seedTemplates[0]?.id ?? '',
    feedback: createEmptyFeedbackState(weeks.length)
  };
};
