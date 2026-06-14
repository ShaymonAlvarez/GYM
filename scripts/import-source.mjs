import fs from 'node:fs/promises';
import path from 'node:path';
import XLSX from 'xlsx';
import XlsxPopulate from 'xlsx-populate';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

const WORKBOOK_PATH = 'Planilha de cargas Rayza Alvarez_clean.xlsx';
const CATALOG_PATH = 'Catálogo de exercícios.pdf';
const PROGRAM_OUTPUT_PATH = path.resolve('src/data/importedProgram.json');
const LAYOUT_OUTPUT_PATH = path.resolve('src/data/sheetLayout.json');
const WORKOUT_SHEET_NAME = 'cargas - Planilha para acompanh';
const WORKOUT_META = [
  { id: 'treino-a', name: 'Treino A', subtitle: 'Gluteo e pernas', accent: '#f09a36' },
  { id: 'treino-b', name: 'Treino B', subtitle: 'Ombro, peito e costas', accent: '#e55d2d' },
  { id: 'treino-c', name: 'Treino C', subtitle: 'Gluteo e posterior', accent: '#f2c14e' },
  { id: 'treino-d', name: 'Treino D', subtitle: 'Ombro, costas e triceps', accent: '#c94f34' }
];
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
const LAYOUT_RANGE = {
  startRow: 1,
  endRow: 27,
  startColumn: 1,
  endColumn: 36
};
const STYLE_KEYS = [
  'fill',
  'fontColor',
  'bold',
  'italic',
  'underline',
  'fontSize',
  'fontFamily',
  'horizontalAlignment',
  'verticalAlignment',
  'wrapText',
  'leftBorderStyle',
  'rightBorderStyle',
  'topBorderStyle',
  'bottomBorderStyle',
  'leftBorderColor',
  'rightBorderColor',
  'topBorderColor',
  'bottomBorderColor'
];
const THEME_COLORS = {
  0: '#FFFFFF',
  1: '#000000',
  2: '#EEECE1',
  3: '#1F497D',
  4: '#4F81BD',
  5: '#C0504D',
  6: '#9BBB59',
  7: '#8064A2',
  8: '#4BACC6',
  9: '#F79646'
};

const EXERCISE_ENRICHMENTS = {
  'cadeira-abdutora': {
    focus: 'Gluteo medio',
    cue: 'Empurre para fora sem perder o controle da volta e sem balancar o tronco.',
    aliases: ['Cadeira abdutora']
  },
  'elevacao-pelvica': {
    focus: 'Gluteo maximo',
    cue: 'Suba contraindo os gluteos, pause no topo e evite compensar com a lombar.',
    aliases: ['Elevação pélvica']
  },
  'leg-press': {
    focus: 'Quadriceps e gluteo',
    cue: 'Desca controlando o joelho e empurre a plataforma sem tirar o quadril do banco.',
    aliases: ['Leg press']
  },
  'cadeira-extensora': {
    focus: 'Quadriceps',
    cue: 'Estenda ate o topo, segure um instante e retorne sem soltar o peso.',
    aliases: ['Cadeira extensora']
  },
  'cadeira-flexora': {
    focus: 'Posterior de coxa',
    cue: 'Puxe com o posterior e controle a descida para manter tensao o tempo inteiro.',
    aliases: ['Cadeira flexora']
  },
  'elevacao-lateral-com-halter': {
    focus: 'Deltoide lateral',
    cue: 'Suba os halteres ate a linha do ombro e desca sem embalo.',
    aliases: ['Elevação lateral com halter', 'Elevação lateral']
  },
  'supino-reto-maquina': {
    focus: 'Peitoral',
    cue: 'Mantenha as escapulas apoiadas e empurre sem projetar os ombros para frente.',
    aliases: ['Supino reto máquina']
  },
  'puxada-pronada-polia': {
    focus: 'Dorsal',
    cue: 'Inicie puxando pelas costas e finalize com o cotovelo para baixo e para tras.',
    aliases: ['Puxada pronada polia']
  },
  'remada-serrote': {
    focus: 'Dorsal e romboides',
    cue: 'Mantenha o tronco firme e puxe com o cotovelo colado ao corpo.',
    aliases: ['Remada serrote']
  },
  'rosca-direta-polia': {
    focus: 'Biceps',
    cue: 'Cotovelos fixos ao lado do corpo e subida sem usar impulso.',
    aliases: ['Rosca direta polia']
  },
  rdl: {
    focus: 'Posterior e gluteo',
    cue: 'Empurre o quadril para tras mantendo a coluna neutra e a carga proxima das pernas.',
    aliases: ['RDL']
  },
  'mesa-flexora': {
    focus: 'Posterior de coxa',
    cue: 'Evite tirar o quadril do banco e controle a volta ate o fim do movimento.',
    aliases: ['Mesa flexora']
  },
  'desenvolvimento-com-halter': {
    focus: 'Ombro',
    cue: 'Empurre acima da cabeca sem arquear a lombar e sem perder o controle.',
    aliases: ['Desenvolvimento com halter', 'Desenvolvimento c/h']
  },
  'puxada-neutra-polia': {
    focus: 'Dorsal',
    cue: 'Leve o cotovelo para baixo e para tras antes de devolver a barra.',
    aliases: ['Puxada neutra polia']
  },
  'remada-pronada-maquina': {
    focus: 'Dorsal e meio das costas',
    cue: 'Puxe aproximando as escapulas e evite jogar o tronco para tras.',
    aliases: ['Remada pronada máquina', 'Remada pronada maquina']
  },
  'triceps-polia': {
    focus: 'Triceps',
    cue: 'Estenda os cotovelos sem abrir os bracos e controle a volta.',
    aliases: ['Triceps polia', 'Tríceps polia']
  }
};

const normalizeText = (value = '') =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ﬂ/g, 'fl')
    .replace(/ﬁ/g, 'fi')
    .replace(/c\/h/gi, 'com halter')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase();

const slugify = (value) => normalizeText(value).toLowerCase().replace(/\s+/g, '-');

const formatCellValue = (value) => {
  if (value === null || value === undefined || value === '') {
    return '';
  }

  if (typeof value === 'number') {
    return Number.isInteger(value) ? String(value) : String(value);
  }

  return String(value).trim();
};

const parseNumericCell = (value) => {
  const formatted = formatCellValue(value);

  if (!formatted) {
    return null;
  }

  const parsed = Number(formatted.replace(',', '.'));

  return Number.isFinite(parsed) ? parsed : null;
};

const getYouTubeVideoId = (url) => {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, '');

    if (host === 'youtu.be') {
      return parsed.pathname.replace(/^\//, '') || null;
    }

    if (host.endsWith('youtube.com')) {
      if (parsed.pathname === '/watch') {
        return parsed.searchParams.get('v');
      }

      const parts = parsed.pathname.split('/').filter(Boolean);

      if (parts[0] === 'shorts' || parts[0] === 'embed') {
        return parts[1] ?? null;
      }
    }
  } catch {
    return null;
  }

  return null;
};

const buildThumbnailUrl = (url) => {
  const videoId = getYouTubeVideoId(url);

  return videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : undefined;
};

const columnToLetter = (index) => {
  let current = index;
  let result = '';

  while (current > 0) {
    const remainder = (current - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    current = Math.floor((current - 1) / 26);
  }

  return result;
};

const normalizeColor = (color) => {
  if (!color) {
    return null;
  }

  if (typeof color === 'string') {
    return `#${color.slice(-6)}`;
  }

  if (color.rgb) {
    return `#${String(color.rgb).slice(-6)}`;
  }

  if (typeof color.theme === 'number') {
    return THEME_COLORS[color.theme] ?? null;
  }

  return null;
};

const createSummary = (totalLoad, averageReps, setCount) => ({
  totalLoad,
  averageReps,
  setCount
});

const serializeDisplayValue = (sheet, address, fallbackValue) => {
  const formatted = sheet[address]?.w;

  if (formatted !== undefined && formatted !== null) {
    return String(formatted);
  }

  if (fallbackValue === null || fallbackValue === undefined || fallbackValue === '') {
    return '';
  }

  if (typeof fallbackValue === 'object' && 'text' in fallbackValue) {
    return String(fallbackValue.text);
  }

  return String(fallbackValue);
};

const readWorkbookRows = () => {
  const workbook = XLSX.readFile(WORKBOOK_PATH, { cellStyles: true, cellFormula: true });
  const worksheet = workbook.Sheets[WORKOUT_SHEET_NAME];
  const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
  const groups = [];
  let currentGroup = [];

  for (let rowIndex = 4; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex];
    const exerciseName = formatCellValue(row?.[0]);

    if (!exerciseName) {
      if (currentGroup.length) {
        groups.push(currentGroup);
        currentGroup = [];
      }
      continue;
    }

    currentGroup.push({ rowNumber: rowIndex + 1, values: row });
  }

  if (currentGroup.length) {
    groups.push(currentGroup);
  }

  return { workbook, worksheet, groups };
};

const parseWorkoutGroups = () => {
  const { groups } = readWorkbookRows();

  return groups.map((rows, index) => {
    const meta = WORKOUT_META[index] ?? {
      id: `treino-${index + 1}`,
      name: `Treino ${index + 1}`,
      subtitle: 'Importado da planilha',
      accent: '#f09a36'
    };

    return {
      ...meta,
      exercises: rows.map(({ rowNumber, values }) => {
        const name = formatCellValue(values[0]);
        const id = slugify(name);
        const enrichment = EXERCISE_ENRICHMENTS[id] ?? {
          focus: 'Execucao guiada',
          cue: 'Preencha somente as series destacadas na planilha e revise a execução no vídeo.',
          aliases: [name]
        };
        const orangeSetCount = Number(values[1] || 0);
        const redSetCount = Number(values[2] || 0);
        const activeSlotIndices = [];
        const currentSets = [];
        const summaries = SUMMARY_COLUMN_PAIRS.map((pair, weekIndex) => {
          const load = parseNumericCell(values[19 + weekIndex * 2]);
          const reps = parseNumericCell(values[20 + weekIndex * 2]);

          if (load === null && reps === null) {
            return createSummary(null, null, orangeSetCount + redSetCount);
          }

          return createSummary(load, reps, orangeSetCount + redSetCount);
        });

        SERIES_COLUMN_PAIRS.forEach((_, slotIndex) => {
          const load = formatCellValue(values[3 + slotIndex * 2]);
          const reps = formatCellValue(values[4 + slotIndex * 2]);

          if (!load && !reps) {
            return;
          }

          activeSlotIndices.push(slotIndex);
          currentSets.push({
            slotIndex,
            load,
            reps
          });
        });

        return {
          id,
          name,
          rowNumber,
          focus: enrichment.focus,
          cue: enrichment.cue,
          aliases: enrichment.aliases,
          orangeSetCount,
          redSetCount,
          activeSlotIndices,
          currentSets,
          summaries
        };
      })
    };
  });
};

const readCatalogLinks = async () => {
  const pdf = await getDocument(CATALOG_PATH).promise;
  const links = new Map();

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const annotations = await page.getAnnotations();

    for (const annotation of annotations) {
      if (!annotation.url || !annotation.overlaidText) {
        continue;
      }

      const label = String(annotation.overlaidText).replace(/\s+/g, ' ').trim();
      const normalizedLabel = normalizeText(label);

      if (!normalizedLabel || links.has(normalizedLabel)) {
        continue;
      }

      links.set(normalizedLabel, {
        catalogLabel: label,
        catalogPage: pageNumber,
        videoUrl: annotation.url,
        thumbnailUrl: buildThumbnailUrl(annotation.url)
      });
    }
  }

  return links;
};

const resolveCatalogEntry = (exercise, catalogMap) => {
  const candidates = [exercise.name, ...(exercise.aliases ?? [])];

  for (const candidate of candidates) {
    const directMatch = catalogMap.get(normalizeText(candidate));

    if (directMatch) {
      return directMatch;
    }
  }

  const normalizedCandidates = candidates.map(normalizeText);

  for (const [key, value] of catalogMap.entries()) {
    if (normalizedCandidates.some((candidate) => key.includes(candidate) || candidate.includes(key))) {
      return value;
    }
  }

  return null;
};

const extractSheetLayout = async () => {
  const workbook = await XlsxPopulate.fromFileAsync(WORKBOOK_PATH);
  const xlsxWorkbook = XLSX.readFile(WORKBOOK_PATH, { cellStyles: true, cellFormula: true });
  const xlsxSheet = xlsxWorkbook.Sheets[WORKOUT_SHEET_NAME];
  const sheet = workbook.sheet(WORKOUT_SHEET_NAME);
  const cells = {};

  for (let rowNumber = LAYOUT_RANGE.startRow; rowNumber <= LAYOUT_RANGE.endRow; rowNumber += 1) {
    for (let columnNumber = LAYOUT_RANGE.startColumn; columnNumber <= LAYOUT_RANGE.endColumn; columnNumber += 1) {
      const address = `${columnToLetter(columnNumber)}${rowNumber}`;
      const cell = sheet.cell(address);
      const styles = cell.style(STYLE_KEYS);

      cells[address] = {
        display: serializeDisplayValue(xlsxSheet, address, cell.value()),
        style: {
          fillColor: normalizeColor(styles.fill?.color ?? styles.fill?.foreground ?? styles.fill?.background),
          fontColor: normalizeColor(styles.fontColor),
          bold: styles.bold ?? false,
          italic: styles.italic ?? false,
          underline: Boolean(styles.underline),
          fontSize: styles.fontSize ?? 11,
          fontFamily: styles.fontFamily ?? 'Arial',
          horizontalAlignment: styles.horizontalAlignment ?? 'general',
          verticalAlignment: styles.verticalAlignment ?? 'bottom',
          wrapText: styles.wrapText ?? false,
          leftBorderStyle: styles.leftBorderStyle ?? null,
          rightBorderStyle: styles.rightBorderStyle ?? null,
          topBorderStyle: styles.topBorderStyle ?? null,
          bottomBorderStyle: styles.bottomBorderStyle ?? null,
          leftBorderColor: normalizeColor(styles.leftBorderColor),
          rightBorderColor: normalizeColor(styles.rightBorderColor),
          topBorderColor: normalizeColor(styles.topBorderColor),
          bottomBorderColor: normalizeColor(styles.bottomBorderColor)
        }
      };
    }
  }

  return {
    startRow: LAYOUT_RANGE.startRow,
    endRow: LAYOUT_RANGE.endRow,
    startColumn: LAYOUT_RANGE.startColumn,
    endColumn: LAYOUT_RANGE.endColumn,
    rowHeights: Array.from({ length: LAYOUT_RANGE.endRow - LAYOUT_RANGE.startRow + 1 }, (_, index) => {
      const rowNumber = LAYOUT_RANGE.startRow + index;
      return sheet.row(rowNumber).height() ?? 20;
    }),
    columnWidths: Array.from({ length: LAYOUT_RANGE.endColumn - LAYOUT_RANGE.startColumn + 1 }, (_, index) => {
      const columnNumber = LAYOUT_RANGE.startColumn + index;
      return sheet.column(columnNumber).width() ?? 8.43;
    }),
    merges: (xlsxSheet['!merges'] ?? []).map((merge) => ({
      startRow: merge.s.r + 1,
      endRow: merge.e.r + 1,
      startColumn: merge.s.c + 1,
      endColumn: merge.e.c + 1
    })),
    cells
  };
};

const fileExists = async (filePath) => {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
};

const main = async () => {
  // Source files (xlsx workbook + catalog PDF) are local dev assets not committed
  // to git. The generated JSON (src/data/importedProgram.json, sheetLayout.json)
  // IS committed. On CI/deploy (e.g. Render) the source files are absent, so we
  // skip regeneration and build from the committed JSON instead of failing.
  const hasWorkbook = await fileExists(WORKBOOK_PATH);
  const hasCatalog = await fileExists(CATALOG_PATH);

  if (!hasWorkbook || !hasCatalog) {
    console.log(
      '[import:source] Source files not found — using committed src/data/*.json. Skipping regeneration.'
    );
    return;
  }

  const workouts = parseWorkoutGroups();
  const catalogMap = await readCatalogLinks();
  const layout = await extractSheetLayout();
  const missingCatalog = [];

  const latestWeekIndex = workouts.reduce((highestIndex, workout) => {
    const workoutHighest = workout.exercises.reduce((exerciseHighest, exercise) => {
      const lastFilledIndex = exercise.summaries.reduce((currentHighest, summary, weekIndex) => {
        if (summary.totalLoad === null && summary.averageReps === null) {
          return currentHighest;
        }

        return weekIndex;
      }, exerciseHighest);

      return Math.max(exerciseHighest, lastFilledIndex);
    }, highestIndex);

    return Math.max(highestIndex, workoutHighest);
  }, 0);

  const importedWorkouts = workouts.map((workout) => ({
    id: workout.id,
    name: workout.name,
    subtitle: workout.subtitle,
    accent: workout.accent,
    exercises: workout.exercises.map((exercise) => {
      const catalogEntry = resolveCatalogEntry(exercise, catalogMap);

      if (!catalogEntry) {
        missingCatalog.push(exercise.name);
      }

      return {
        id: exercise.id,
        name: exercise.name,
        rowNumber: exercise.rowNumber,
        focus: exercise.focus,
        cue: exercise.cue,
        orangeSetCount: exercise.orangeSetCount,
        redSetCount: exercise.redSetCount,
        activeSlotIndices: exercise.activeSlotIndices,
        currentSets: exercise.currentSets,
        summaries: exercise.summaries,
        videoUrl: catalogEntry?.videoUrl,
        thumbnailUrl: catalogEntry?.thumbnailUrl,
        catalogLabel: catalogEntry?.catalogLabel,
        catalogPage: catalogEntry?.catalogPage
      };
    })
  }));

  const programPayload = {
    generatedAt: new Date().toISOString(),
    sourceWorkbook: WORKBOOK_PATH,
    sourceCatalog: CATALOG_PATH,
    latestWeekIndex,
    workouts: importedWorkouts
  };

  await fs.writeFile(PROGRAM_OUTPUT_PATH, `${JSON.stringify(programPayload, null, 2)}\n`);
  await fs.writeFile(LAYOUT_OUTPUT_PATH, `${JSON.stringify(layout, null, 2)}\n`);

  const uniqueMissing = [...new Set(missingCatalog)];

  console.log(`Imported ${importedWorkouts.length} workouts, ${catalogMap.size} catalog links, and the sheet layout.`);

  if (uniqueMissing.length) {
    console.warn(`Catalog links missing for: ${uniqueMissing.join(', ')}`);
  }
};

await main();