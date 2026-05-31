export type SetEntry = {
  load: string;
  reps: string;
};

export type ExerciseTemplate = {
  id: string;
  name: string;
  focus: string;
  cue: string;
  setCount: number;
  videoUrl?: string;
  thumbnailUrl?: string;
  catalogLabel?: string;
  catalogPage?: number;
};

export type WorkoutTemplate = {
  id: string;
  name: string;
  subtitle: string;
  accent: string;
  exercises: ExerciseTemplate[];
};

export type ExerciseLog = {
  exerciseId: string;
  sets: SetEntry[];
};

export type WorkoutLog = {
  workoutId: string;
  exerciseLogs: ExerciseLog[];
};

export type WeekLog = {
  id: string;
  label: string;
  createdAt: string;
  workoutLogs: WorkoutLog[];
};

export type ExerciseCustomization = {
  note?: string;
  imageDataUrl?: string;
};

export type AppState = {
  templates: WorkoutTemplate[];
  customizations: Record<string, ExerciseCustomization>;
  weeks: WeekLog[];
  activeWeekId: string;
  activeWorkoutId: string;
};

export type SummaryMetrics = {
  totalLoad: number;
  averageReps: number;
  setCount: number;
};