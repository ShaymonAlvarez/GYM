export type SetType = 'yellow' | 'orange' | 'red';

export type SetEntry = {
  slotIndex: number;
  type: SetType;
  load: string;
  reps: string;
  activeSeconds?: number;
  restSeconds?: number;
  /** Per-set target rest duration in seconds (configurable per series). */
  restTarget?: number;
};

export type ExerciseSummary = {
  totalLoad: number | null;
  averageReps: number | null;
  setCount: number;
};

export type ExerciseTemplate = {
  id: string;
  name: string;
  rowNumber: number;
  focus: string;
  cue: string;
  orangeSetCount: number;
  redSetCount: number;
  activeSlotIndices: number[];
  videoUrl?: string;
  thumbnailUrl?: string;
  catalogLabel?: string;
  catalogPage?: number;
  yellowSetCount?: number;
  expectedReps?: string;
  restInterval?: string;
  rir?: string;
  setDetails?: {
    yellow?: { reps: string; rest: string; rir: string };
    orange?: { reps: string; rest: string; rir: string };
    red?: { reps: string; rest: string; rir: string };
  };
  methods?: string;
  pdfNotes?: string;
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
  summary: ExerciseSummary;
};

export type WorkoutLog = {
  workoutId: string;
  exerciseLogs: ExerciseLog[];
  durationSeconds?: number;
};

export type WeekLog = {
  index: number;
  label: string;
  workoutLogs: WorkoutLog[];
};

export type FeedbackState = {
  weeklyAnswers: string[][];
  weeklyComments: string[];
  photoNote: string;
};

export type LocalMediaAsset = {
  id: string;
  type: 'photo' | 'video';
  name: string;
  dataUrl?: string;
  remoteUrl?: string;
  storagePath?: string;
  mimeType?: string;
  originalBytes?: number;
  optimizedBytes?: number;
  syncedAt?: string;
  createdAt: string;
  weekIndex: number;
  workoutId: string;
  exerciseId?: string;
};

export type SupabaseSettings = {
  enabled: boolean;
  projectUrl: string;
  anonKey: string;
};

export type ArchivedPeriod = {
  id: string;
  archivedAt: string;
  label: string;
  state: Partial<AppState>;
};

export type WorkoutSession = {
  date: string; // YYYY-MM-DD
  durationSeconds: number;
};

export type AppState = {
  templates: WorkoutTemplate[];
  weeks: WeekLog[];
  activeWeekIndex: number;
  activeWorkoutId: string;
  feedback?: FeedbackState;
  localMedia?: LocalMediaAsset[];
  supabase?: SupabaseSettings;
  theme?: 'light' | 'dark' | 'system';
  preferences?: {
    hideWarmupSets?: boolean;
    week7Enabled?: boolean;
  };
  archives?: ArchivedPeriod[];
  workoutSessions?: WorkoutSession[];
};

export type SummaryMetrics = ExerciseSummary;

export type SheetCellStyle = {
  fillColor: string | null;
  fontColor: string | null;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  fontSize: number | string;
  fontFamily: string;
  horizontalAlignment: string;
  verticalAlignment: string;
  wrapText: boolean;
  leftBorderStyle: string | null;
  rightBorderStyle: string | null;
  topBorderStyle: string | null;
  bottomBorderStyle: string | null;
  leftBorderColor: string | null;
  rightBorderColor: string | null;
  topBorderColor: string | null;
  bottomBorderColor: string | null;
};

export type SheetLayoutCell = {
  display: string;
  style: SheetCellStyle;
};

export type SheetLayoutMerge = {
  startRow: number;
  endRow: number;
  startColumn: number;
  endColumn: number;
};

export type SheetLayout = {
  startRow: number;
  endRow: number;
  startColumn: number;
  endColumn: number;
  rowHeights: Array<number | string>;
  columnWidths: Array<number | string>;
  merges: SheetLayoutMerge[];
  cells: Record<string, SheetLayoutCell>;
};
