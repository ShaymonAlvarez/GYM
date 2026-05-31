import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import XlsxPopulate from 'xlsx-populate/browser/xlsx-populate-no-encryption.min.js';
import type { AppState, SheetLayout, SummaryMetrics, WorkoutLog } from '../types';
import { formatWorkbookNumber } from './state';

const WORKBOOK_SHEET_NAME = 'cargas - Planilha para acompanh';
const WORKBOOK_TEMPLATE_URL = new URL('../../Planilha de cargas Rayza Alvarez_clean.xlsx', import.meta.url).href;
const SERIES_COLUMN_PAIRS = [
  { load: 'D', reps: 'E' },
  { load: 'F', reps: 'G' },
  { load: 'H', reps: 'I' },
  { load: 'J', reps: 'K' },
  { load: 'L', reps: 'M' },
  { load: 'N', reps: 'O' },
  { load: 'P', reps: 'Q' }
];
const SUMMARY_COLUMN_PAIRS = [
  { load: 'T', reps: 'U' },
  { load: 'V', reps: 'W' },
  { load: 'X', reps: 'Y' },
  { load: 'Z', reps: 'AA' },
  { load: 'AB', reps: 'AC' },
  { load: 'AD', reps: 'AE' },
  { load: 'AF', reps: 'AG' }
];

type WorkbookCellMap = Record<string, string>;

const toWorkbookValue = (value: string): number | string => {
  const trimmed = value.trim();

  if (!trimmed) {
    return '';
  }

  const parsed = Number(trimmed.replace(',', '.'));

  return Number.isFinite(parsed) ? parsed : trimmed;
};

const getWorkoutLog = (state: AppState, weekIndex: number, workoutId: string): WorkoutLog | null => {
  const week = state.weeks[weekIndex];

  return week?.workoutLogs.find((workoutLog) => workoutLog.workoutId === workoutId) ?? null;
};

const getExerciseSummary = (
  state: AppState,
  weekIndex: number,
  workoutId: string,
  exerciseId: string
): SummaryMetrics => {
  const workoutLog = getWorkoutLog(state, weekIndex, workoutId);
  const exerciseLog = workoutLog?.exerciseLogs.find((entry) => entry.exerciseId === exerciseId);

  return (
    exerciseLog?.summary ?? {
      totalLoad: null,
      averageReps: null,
      setCount: 0
    }
  );
};

const getSelectedWeekExerciseSets = (state: AppState, weekIndex: number, workoutId: string, exerciseId: string) => {
  const workoutLog = getWorkoutLog(state, weekIndex, workoutId);

  return workoutLog?.exerciseLogs.find((entry) => entry.exerciseId === exerciseId)?.sets ?? [];
};

const downloadBlob = (blob: Blob, fileName: string) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
};

const buildExportName = (weekIndex: number, extension: 'xlsx' | 'pdf') =>
  `ficha-cargas-semana-${weekIndex + 1}.${extension}`;

const createBaseCellMap = (layout: SheetLayout): WorkbookCellMap =>
  Object.fromEntries(Object.entries(layout.cells).map(([address, cell]) => [address, cell.display]));

export const buildSheetDisplayValues = (
  state: AppState,
  layout: SheetLayout,
  selectedWeekIndex: number
): WorkbookCellMap => {
  const values = createBaseCellMap(layout);

  state.templates.forEach((workout) => {
    workout.exercises.forEach((exercise) => {
      const rowNumber = exercise.rowNumber;

      SERIES_COLUMN_PAIRS.forEach((pair) => {
        values[`${pair.load}${rowNumber}`] = '';
        values[`${pair.reps}${rowNumber}`] = '';
      });

      SUMMARY_COLUMN_PAIRS.forEach((pair) => {
        values[`${pair.load}${rowNumber}`] = '';
        values[`${pair.reps}${rowNumber}`] = '';
      });

      const selectedSets = getSelectedWeekExerciseSets(state, selectedWeekIndex, workout.id, exercise.id);
      const selectedSummary = getExerciseSummary(state, selectedWeekIndex, workout.id, exercise.id);

      selectedSets.forEach((setEntry) => {
        const pair = SERIES_COLUMN_PAIRS[setEntry.slotIndex];

        if (!pair) {
          return;
        }

        values[`${pair.load}${rowNumber}`] = setEntry.load;
        values[`${pair.reps}${rowNumber}`] = setEntry.reps;
      });

      values[`R${rowNumber}`] = formatWorkbookNumber(selectedSummary.totalLoad);
      values[`S${rowNumber}`] = formatWorkbookNumber(selectedSummary.averageReps);

      state.weeks.forEach((_, weekIndex) => {
        const pair = SUMMARY_COLUMN_PAIRS[weekIndex];
        const summary = getExerciseSummary(state, weekIndex, workout.id, exercise.id);

        values[`${pair.load}${rowNumber}`] = formatWorkbookNumber(summary.totalLoad);
        values[`${pair.reps}${rowNumber}`] = formatWorkbookNumber(summary.averageReps);
      });
    });
  });

  return values;
};

const loadTemplateWorkbook = async () => {
  const response = await fetch(WORKBOOK_TEMPLATE_URL);

  if (!response.ok) {
    throw new Error('Nao foi possivel carregar a planilha modelo.');
  }

  return XlsxPopulate.fromDataAsync(await response.arrayBuffer());
};

export const exportWorkbookFile = async (state: AppState, selectedWeekIndex: number): Promise<void> => {
  const workbook = await loadTemplateWorkbook();
  const sheet = workbook.sheet(WORKBOOK_SHEET_NAME);

  state.templates.forEach((workout) => {
    workout.exercises.forEach((exercise) => {
      const rowNumber = exercise.rowNumber;

      SERIES_COLUMN_PAIRS.forEach((pair) => {
        sheet.cell(`${pair.load}${rowNumber}`).value('');
        sheet.cell(`${pair.reps}${rowNumber}`).value('');
      });

      SUMMARY_COLUMN_PAIRS.forEach((pair) => {
        sheet.cell(`${pair.load}${rowNumber}`).value('');
        sheet.cell(`${pair.reps}${rowNumber}`).value('');
      });

      getSelectedWeekExerciseSets(state, selectedWeekIndex, workout.id, exercise.id).forEach((setEntry) => {
        const pair = SERIES_COLUMN_PAIRS[setEntry.slotIndex];

        if (!pair) {
          return;
        }

        sheet.cell(`${pair.load}${rowNumber}`).value(toWorkbookValue(setEntry.load));
        sheet.cell(`${pair.reps}${rowNumber}`).value(toWorkbookValue(setEntry.reps));
      });

      state.weeks.forEach((_, weekIndex) => {
        const pair = SUMMARY_COLUMN_PAIRS[weekIndex];
        const summary = getExerciseSummary(state, weekIndex, workout.id, exercise.id);

        sheet.cell(`${pair.load}${rowNumber}`).value(summary.totalLoad ?? '');
        sheet.cell(`${pair.reps}${rowNumber}`).value(summary.averageReps ?? '');
      });
    });
  });

  const workbookBlob = await workbook.outputAsync();
  downloadBlob(workbookBlob, buildExportName(selectedWeekIndex, 'xlsx'));
};

export const exportWorkbookPdf = async (target: HTMLElement, selectedWeekIndex: number): Promise<void> => {
  const canvas = await html2canvas(target, {
    scale: 2,
    backgroundColor: '#ffffff',
    useCORS: true,
    logging: false
  });
  const imageData = canvas.toDataURL('image/png');
  const orientation = canvas.width >= canvas.height ? 'landscape' : 'portrait';
  const pdf = new jsPDF({
    orientation,
    unit: 'px',
    format: [canvas.width, canvas.height]
  });

  pdf.addImage(imageData, 'PNG', 0, 0, canvas.width, canvas.height);
  pdf.save(buildExportName(selectedWeekIndex, 'pdf'));
};