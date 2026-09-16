import type { SheetLayout, SheetLayoutCell, SheetLayoutMerge, WorkoutTemplate } from '../types';

// A planilha modelo tem 4 grupos de treino com 5 linhas cada, separados por uma
// linha amarela: 5-9, (10), 11-15, (16), 17-21, (22), 23-27. Quando um treino
// importado tem mais de 5 exercícios, o grupo cresce e os grupos seguintes descem.
export const FIRST_EXERCISE_ROW = 5;
export const WORKOUT_GROUP_COUNT = 4;
const DEFAULT_GROUP_CAPACITY = 5;
const TEMPLATE_LAST_EXERCISE_ROW = FIRST_EXERCISE_ROW + WORKOUT_GROUP_COUNT * (DEFAULT_GROUP_CAPACITY + 1) - 2; // 27
const SEPARATOR_FIRST_COLUMN = 2; // B
const SEPARATOR_LAST_COLUMN = 33; // AG

export type ExerciseGroup = { startRow: number; capacity: number };

export type ExerciseGroupLayout = {
  groups: ExerciseGroup[];
  exerciseRows: number[];
  separatorRows: number[];
  lastRow: number;
};

type RowMapping = { row: number; sourceRow: number; isSeparator: boolean };

const templateGroupStartRow = (groupIndex: number) => FIRST_EXERCISE_ROW + groupIndex * (DEFAULT_GROUP_CAPACITY + 1);

export const buildExerciseGroupLayout = (exerciseCounts: number[]): ExerciseGroupLayout => {
  const groups: ExerciseGroup[] = [];
  const exerciseRows: number[] = [];
  const separatorRows: number[] = [];
  let row = FIRST_EXERCISE_ROW;

  for (let groupIndex = 0; groupIndex < WORKOUT_GROUP_COUNT; groupIndex += 1) {
    const capacity = Math.max(DEFAULT_GROUP_CAPACITY, exerciseCounts[groupIndex] ?? 0);

    if (groupIndex > 0) {
      separatorRows.push(row);
      row += 1;
    }

    groups.push({ startRow: row, capacity });
    for (let offset = 0; offset < capacity; offset += 1) {
      exerciseRows.push(row + offset);
    }
    row += capacity;
  }

  return { groups, exerciseRows, separatorRows, lastRow: row - 1 };
};

export const getExerciseGroupLayout = (templates: WorkoutTemplate[]) =>
  buildExerciseGroupLayout(templates.map((template) => template.exercises.length));

export const isDefaultExerciseGroupLayout = (layout: ExerciseGroupLayout) =>
  layout.groups.every((group) => group.capacity === DEFAULT_GROUP_CAPACITY);

/**
 * Para cada linha do novo layout, indica de qual linha da planilha modelo copiar
 * estilos/fórmulas. Linhas extras de um grupo copiam uma linha do meio do grupo
 * modelo; a última linha copia a última do modelo (bordas inferiores).
 */
const mapRowsToTemplate = (layout: ExerciseGroupLayout): RowMapping[] => {
  const mappings: RowMapping[] = [];

  layout.groups.forEach((group, groupIndex) => {
    if (groupIndex > 0) {
      mappings.push({ row: group.startRow - 1, sourceRow: templateGroupStartRow(groupIndex) - 1, isSeparator: true });
    }

    const templateStart = templateGroupStartRow(groupIndex);
    for (let offset = 0; offset < group.capacity; offset += 1) {
      const templateOffset =
        offset === 0 ? 0 : offset === group.capacity - 1 ? DEFAULT_GROUP_CAPACITY - 1 : Math.min(offset, DEFAULT_GROUP_CAPACITY - 2);
      mappings.push({ row: group.startRow + offset, sourceRow: templateStart + templateOffset, isSeparator: false });
    }
  });

  return mappings;
};

const splitAddress = (address: string) => {
  const match = /^([A-Z]+)(\d+)$/.exec(address);
  return match ? { column: match[1], row: Number(match[2]) } : null;
};

// ═══════════════════════════════════════════
// Planilha exibida na tela (sheetLayout.json)
// ═══════════════════════════════════════════

export const adaptSheetLayout = (base: SheetLayout, layout: ExerciseGroupLayout): SheetLayout => {
  if (isDefaultExerciseGroupLayout(layout)) {
    return base;
  }

  const regionEnd = Math.max(TEMPLATE_LAST_EXERCISE_ROW, layout.lastRow);
  const cells: Record<string, SheetLayoutCell> = {};
  const columnsByRow = new Map<number, string[]>();

  Object.entries(base.cells).forEach(([address, cell]) => {
    const parts = splitAddress(address);
    if (!parts) return;
    if (parts.row < FIRST_EXERCISE_ROW || parts.row > regionEnd) {
      cells[address] = cell;
    }
    columnsByRow.set(parts.row, [...(columnsByRow.get(parts.row) ?? []), parts.column]);
  });

  const endRow = Math.max(base.endRow, regionEnd);
  const rowHeights = Array.from({ length: endRow - base.startRow + 1 }, (_, index) => base.rowHeights[index] ?? 20);

  mapRowsToTemplate(layout).forEach(({ row, sourceRow }) => {
    (columnsByRow.get(sourceRow) ?? []).forEach((column) => {
      cells[`${column}${row}`] = base.cells[`${column}${sourceRow}`];
    });
    rowHeights[row - base.startRow] = base.rowHeights[sourceRow - base.startRow] ?? 20;
  });

  const merges: SheetLayoutMerge[] = [
    ...base.merges.filter((merge) => merge.endRow < FIRST_EXERCISE_ROW || merge.startRow > regionEnd),
    ...layout.separatorRows.map((row) => ({
      startRow: row,
      endRow: row,
      startColumn: SEPARATOR_FIRST_COLUMN,
      endColumn: SEPARATOR_LAST_COLUMN
    }))
  ];

  return { ...base, endRow, rowHeights, merges, cells };
};

// ═══════════════════════════════════════════
// Planilha exportada (XML da aba de cargas)
// ═══════════════════════════════════════════

const ROW_XML_REGEX = /<row r="(\d+)"[^>]*?(?:\/>|>[\s\S]*?<\/row>)/g;

const retargetRowXml = (rowXml: string, sourceRow: number, targetRow: number) => {
  const cellReference = new RegExp(`\\b([A-Z]{1,3})${sourceRow}(?!\\d)`, 'g');
  const retargetReferences = (text: string) => text.replace(cellReference, `$1${targetRow}`);

  return rowXml
    .replace(/^<row r="\d+"/, `<row r="${targetRow}"`)
    .replace(/<c r="([A-Z]+)\d+"/g, `<c r="$1${targetRow}"`)
    .replace(/(<f\b[^>]*>)([^<]*)(<\/f>)/g, (_, open: string, formula: string, close: string) =>
      `${retargetReferences(open)}${retargetReferences(formula)}${close}`
    );
};

const retargetConditionalFormatting = (cfXml: string, layout: ExerciseGroupLayout, regionEnd: number) => {
  const sqrefMatch = /sqref="([^"]+)"/.exec(cfXml);
  if (!sqrefMatch) return cfXml;

  let firstRowChange: { from: number; to: number } | null = null;
  const ranges = sqrefMatch[1].split(' ').map((range, rangeIndex) => {
    const [start, end = start] = range.split(':');
    const startParts = splitAddress(start);
    const endParts = splitAddress(end);
    if (!startParts || !endParts || startParts.row < FIRST_EXERCISE_ROW || endParts.row > regionEnd) {
      return range;
    }

    const groupIndex = layout.groups.findIndex((_, index) => templateGroupStartRow(index) === startParts.row);
    if (groupIndex < 0) return range;

    const group = layout.groups[groupIndex];
    if (rangeIndex === 0) {
      firstRowChange = { from: startParts.row, to: group.startRow };
    }
    return `${startParts.column}${group.startRow}:${endParts.column}${group.startRow + group.capacity - 1}`;
  });

  let result = cfXml.replace(sqrefMatch[0], `sqref="${ranges.join(' ')}"`);
  const change = firstRowChange as { from: number; to: number } | null;
  if (change && change.from !== change.to) {
    const reference = new RegExp(`\\b([A-Z]{1,3})${change.from}(?!\\d)`, 'g');
    result = result.replace(/(<formula>)([^<]*)(<\/formula>)/g, (_, open: string, formula: string, close: string) =>
      `${open}${formula.replace(reference, `$1${change.to}`)}${close}`
    );
  }
  return result;
};

/** Reorganiza as linhas de exercício do XML da aba de cargas conforme o layout. */
export const restructureCargasSheetXml = (xml: string, layout: ExerciseGroupLayout): string => {
  if (isDefaultExerciseGroupLayout(layout)) {
    return xml;
  }

  const regionEnd = Math.max(TEMPLATE_LAST_EXERCISE_ROW, layout.lastRow);
  const sheetDataStart = xml.indexOf('<sheetData>') + '<sheetData>'.length;
  const sheetDataEnd = xml.indexOf('</sheetData>');
  const rows = new Map<number, string>();

  for (const match of xml.slice(sheetDataStart, sheetDataEnd).matchAll(ROW_XML_REGEX)) {
    rows.set(Number(match[1]), match[0]);
  }

  const restructuredRows = new Map<number, string>();
  rows.forEach((rowXml, row) => {
    if (row < FIRST_EXERCISE_ROW || row > regionEnd) restructuredRows.set(row, rowXml);
  });
  mapRowsToTemplate(layout).forEach(({ row, sourceRow }) => {
    const sourceXml = rows.get(sourceRow);
    if (sourceXml) restructuredRows.set(row, retargetRowXml(sourceXml, sourceRow, row));
  });

  const sheetData = [...restructuredRows.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, rowXml]) => rowXml)
    .join('');

  let result = `${xml.slice(0, sheetDataStart)}${sheetData}${xml.slice(sheetDataEnd)}`;

  result = result.replace(/<mergeCells count="\d+">([\s\S]*?)<\/mergeCells>/, (_, inner: string) => {
    const kept = (inner.match(/<mergeCell ref="[^"]+"\/>/g) ?? []).filter((mergeXml) => {
      const [start, end] = /ref="([^"]+)"/.exec(mergeXml)![1].split(':');
      const startRow = splitAddress(start)?.row ?? 0;
      const endRow = splitAddress(end ?? start)?.row ?? 0;
      return endRow < FIRST_EXERCISE_ROW || startRow > regionEnd;
    });
    const separators = layout.separatorRows.map((row) => `<mergeCell ref="B${row}:AG${row}"/>`);
    const merges = [...kept, ...separators];
    return `<mergeCells count="${merges.length}">${merges.join('')}</mergeCells>`;
  });

  return result.replace(/<conditionalFormatting\b[\s\S]*?<\/conditionalFormatting>/g, (cfXml) =>
    retargetConditionalFormatting(cfXml, layout, regionEnd)
  );
};
