import html2canvas from 'html2canvas';
import JSZip from 'jszip';
import jsPDF from 'jspdf';
import XlsxPopulate from 'xlsx-populate/browser/xlsx-populate-no-encryption.min.js';
import {
  COMMENT_WEEK_START_ROWS,
  FEEDBACK_QUESTIONS,
  FEEDBACK_WEEK_COLUMNS,
  PHOTO_NOTE_ROW,
  normalizeFeedbackState
} from '../data/feedback';
import type { AppState, SheetLayout, SummaryMetrics, WorkoutLog } from '../types';
import { formatWorkbookNumber } from './state';

const WORKBOOK_SHEET_NAME = 'cargas - Planilha para acompanh';
const FEEDBACK_SHEET_NAME = 'feedback - Feedback do per\u00edodo';
const COMMENTS_SHEET_NAME = 'feedback - Coment\u00e1rios';
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
type WorkbookCell = {
  clear: () => WorkbookCell;
  formula: () => string | undefined;
  value: (value?: number | string) => unknown;
};
type WorkbookSheet = {
  cell: (address: string) => WorkbookCell;
};
type WorkbookInstance = {
  sheet: (name: string) => WorkbookSheet;
  outputAsync: () => Promise<Blob>;
  _node?: { children?: Array<{ name: string; attributes: Record<string, string> }> };
};
type LoadedWorkbook = {
  workbook: WorkbookInstance;
  templateData: ArrayBuffer;
};

const toWorkbookNumberInput = (value: string): number | '' => {
  const trimmed = value.trim();

  if (!trimmed) {
    return '';
  }

  const parsed = Number(trimmed.replace(',', '.'));

  return Number.isFinite(parsed) ? parsed : '';
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

const writeEditableCell = (sheet: WorkbookSheet, address: string, value: number | string) => {
  const cell = sheet.cell(address);

  if (cell.formula()) {
    return;
  }

  if (value === '') {
    cell.clear();
    return;
  }

  cell.value(value);
};

const markWorkbookForRecalculation = (workbook: WorkbookInstance) => {
  const calcPr = workbook._node?.children?.find((node) => node.name === 'calcPr');

  if (!calcPr) {
    return;
  }

  calcPr.attributes = {
    ...calcPr.attributes,
    calcMode: 'auto',
    fullCalcOnLoad: '1',
    forceFullCalc: '1'
  };
};

const getDirectChildrenByTagName = (element: Element, tagName: string) =>
  Array.from(element.childNodes).filter(
    (node): node is Element => node instanceof Element && node.tagName === tagName
  );

const getColumnIndex = (address: string) =>
  address
    .replace(/\d+/g, '')
    .split('')
    .reduce((columnIndex, letter) => columnIndex * 26 + letter.charCodeAt(0) - 64, 0);

const getRowNumber = (address: string) => Number(address.replace(/\D+/g, ''));

const findCellElement = (doc: Document, address: string) =>
  Array.from(doc.getElementsByTagName('c')).find((cell) => cell.getAttribute('r') === address) ?? null;

const findRowElement = (doc: Document, rowNumber: number) =>
  Array.from(doc.getElementsByTagName('row')).find((row) => Number(row.getAttribute('r')) === rowNumber) ?? null;

const removeCachedFormulaValues = (cell: Element) => {
  getDirectChildrenByTagName(cell, 'v').forEach((valueNode) => {
    cell.removeChild(valueNode);
  });
};

const insertCellInColumnOrder = (row: Element, cell: Element) => {
  const cellAddress = cell.getAttribute('r');

  if (!cellAddress) {
    row.appendChild(cell);
    return;
  }

  const nextColumnIndex = getColumnIndex(cellAddress);
  const nextSibling = getDirectChildrenByTagName(row, 'c').find((existingCell) => {
    const existingAddress = existingCell.getAttribute('r');

    return existingAddress ? getColumnIndex(existingAddress) > nextColumnIndex : false;
  });

  row.insertBefore(cell, nextSibling ?? null);
};

const restoreWorksheetFormulas = (templateXml: string, exportedXml: string) => {
  const parser = new DOMParser();
  const serializer = new XMLSerializer();
  const templateDoc = parser.parseFromString(templateXml, 'application/xml');
  const exportedDoc = parser.parseFromString(exportedXml, 'application/xml');
  const templateFormulaCells = Array.from(templateDoc.getElementsByTagName('c')).filter(
    (cell) => getDirectChildrenByTagName(cell, 'f').length > 0
  );

  templateFormulaCells.forEach((templateCell) => {
    const address = templateCell.getAttribute('r');

    if (!address) {
      return;
    }

    const formulaCell = exportedDoc.importNode(templateCell, true) as Element;
    const exportedCell = findCellElement(exportedDoc, address);

    removeCachedFormulaValues(formulaCell);

    if (exportedCell?.parentNode) {
      exportedCell.parentNode.replaceChild(formulaCell, exportedCell);
      return;
    }

    const row = findRowElement(exportedDoc, getRowNumber(address));

    if (row) {
      insertCellInColumnOrder(row, formulaCell);
    }
  });

  return serializer.serializeToString(exportedDoc);
};

const restoreTemplateFormulas = async (templateData: ArrayBuffer, exportedWorkbook: Blob) => {
  const [templateZip, exportedZip] = await Promise.all([JSZip.loadAsync(templateData), JSZip.loadAsync(exportedWorkbook)]);
  const worksheetPaths = Object.keys(templateZip.files).filter((path) => /^xl\/worksheets\/sheet\d+\.xml$/.test(path));

  await Promise.all(
    worksheetPaths.map(async (path) => {
      const templateFile = templateZip.file(path);
      const exportedFile = exportedZip.file(path);

      if (!templateFile || !exportedFile) {
        return;
      }

      const [templateXml, exportedXml] = await Promise.all([templateFile.async('string'), exportedFile.async('string')]);

      if (!templateXml.includes('<f') && !templateXml.includes(':f')) {
        return;
      }

      exportedZip.file(path, restoreWorksheetFormulas(templateXml, exportedXml));
    })
  );

  return exportedZip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE'
  });
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

  if (state.weeks.length < 7) {
    values.AF3 = '';
    values.AG3 = '';
  }

  return values;
};

const loadTemplateWorkbook = async (): Promise<LoadedWorkbook> => {
  const response = await fetch(WORKBOOK_TEMPLATE_URL);

  if (!response.ok) {
    throw new Error('Nao foi possivel carregar a planilha modelo.');
  }

  const templateData = await response.arrayBuffer();

  return {
    workbook: await XlsxPopulate.fromDataAsync(templateData.slice(0)),
    templateData
  };
};

const exportFeedbackSheets = (workbook: WorkbookInstance, state: AppState) => {
  const feedbackState = normalizeFeedbackState(state.feedback, state.weeks.length);
  const feedbackSheet = workbook.sheet(FEEDBACK_SHEET_NAME);
  const commentsSheet = workbook.sheet(COMMENTS_SHEET_NAME);

  FEEDBACK_WEEK_COLUMNS.forEach((column, weekIndex) => {
    FEEDBACK_QUESTIONS.forEach((question, questionIndex) => {
      writeEditableCell(
        feedbackSheet,
        `${column}${question.rowNumber}`,
        feedbackState.weeklyAnswers[weekIndex]?.[questionIndex] ?? ''
      );
    });
  });

  COMMENT_WEEK_START_ROWS.forEach((rowNumber, weekIndex) => {
    writeEditableCell(commentsSheet, `B${rowNumber}`, feedbackState.weeklyComments[weekIndex] ?? '');
  });

  writeEditableCell(commentsSheet, `B${PHOTO_NOTE_ROW}`, feedbackState.photoNote);
};

export const exportWorkbookFile = async (state: AppState, selectedWeekIndex: number): Promise<void> => {
  const { workbook, templateData } = await loadTemplateWorkbook();
  const sheet = workbook.sheet(WORKBOOK_SHEET_NAME);

  markWorkbookForRecalculation(workbook);

  state.templates.forEach((workout) => {
    workout.exercises.forEach((exercise) => {
      const rowNumber = exercise.rowNumber;

      SERIES_COLUMN_PAIRS.forEach((pair) => {
        writeEditableCell(sheet, `${pair.load}${rowNumber}`, '');
        writeEditableCell(sheet, `${pair.reps}${rowNumber}`, '');
      });

      SUMMARY_COLUMN_PAIRS.forEach((pair) => {
        writeEditableCell(sheet, `${pair.load}${rowNumber}`, '');
        writeEditableCell(sheet, `${pair.reps}${rowNumber}`, '');
      });

      getSelectedWeekExerciseSets(state, selectedWeekIndex, workout.id, exercise.id).forEach((setEntry) => {
        const pair = SERIES_COLUMN_PAIRS[setEntry.slotIndex];

        if (!pair) {
          return;
        }

        writeEditableCell(sheet, `${pair.load}${rowNumber}`, toWorkbookNumberInput(setEntry.load));
        writeEditableCell(sheet, `${pair.reps}${rowNumber}`, toWorkbookNumberInput(setEntry.reps));
      });

      state.weeks.forEach((_, weekIndex) => {
        const pair = SUMMARY_COLUMN_PAIRS[weekIndex];
        const summary = getExerciseSummary(state, weekIndex, workout.id, exercise.id);

        writeEditableCell(sheet, `${pair.load}${rowNumber}`, summary.totalLoad ?? '');
        writeEditableCell(sheet, `${pair.reps}${rowNumber}`, summary.averageReps ?? '');
      });
    });
  });

  exportFeedbackSheets(workbook, state);

  const workbookBlob = await workbook.outputAsync();
  const workbookWithFormulas = await restoreTemplateFormulas(templateData, workbookBlob);

  downloadBlob(workbookWithFormulas, buildExportName(selectedWeekIndex, 'xlsx'));
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
