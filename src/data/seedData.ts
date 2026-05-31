import importedProgram from './importedProgram.json';
import type { AppState, SetEntry, WorkoutTemplate, WeekLog } from '../types';

type ImportedExercise = {
  id: string;
  name: string;
  focus: string;
  cue: string;
  seedSets: SetEntry[];
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
    focus: exercise.focus,
    cue: exercise.cue,
    setCount: exercise.seedSets.length,
    videoUrl: exercise.videoUrl,
    thumbnailUrl: exercise.thumbnailUrl,
    catalogLabel: exercise.catalogLabel,
    catalogPage: exercise.catalogPage
  }))
}));

const createInitialWeek = (): WeekLog => ({
  id: crypto.randomUUID(),
  label: 'Semana 1',
  createdAt: new Date().toISOString(),
  workoutLogs: program.workouts.map((workout) => ({
    workoutId: workout.id,
    exerciseLogs: workout.exercises.map((exercise) => ({
      exerciseId: exercise.id,
      sets: exercise.seedSets.map((setEntry) => ({ ...setEntry }))
    }))
  }))
});

export const createSeedAppState = (): AppState => {
  const firstWeek = createInitialWeek();

  return {
    templates: seedTemplates,
    customizations: {},
    weeks: [firstWeek],
    activeWeekId: firstWeek.id,
    activeWorkoutId: seedTemplates[0]?.id ?? ''
  };
};