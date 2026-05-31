import fs from 'node:fs/promises';
import path from 'node:path';
import XLSX from 'xlsx';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

const WORKBOOK_PATH = 'Planilha de cargas Rayza Alvarez_clean.xlsx';
const CATALOG_PATH = 'Catálogo de exercícios.pdf';
const OUTPUT_PATH = path.resolve('src/data/importedProgram.json');

const WORKOUT_META = [
  { id: 'treino-a', name: 'Treino A', subtitle: 'Gluteo e pernas', accent: '#f09a36' },
  { id: 'treino-b', name: 'Treino B', subtitle: 'Ombro, peito e costas', accent: '#e55d2d' },
  { id: 'treino-c', name: 'Treino C', subtitle: 'Gluteo e posterior', accent: '#f2c14e' },
  { id: 'treino-d', name: 'Treino D', subtitle: 'Ombro, costas e triceps', accent: '#c94f34' }
];

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

const readWorkoutGroups = () => {
  const workbook = XLSX.readFile(WORKBOOK_PATH);
  const worksheet = workbook.Sheets[workbook.SheetNames[2]];
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

    currentGroup.push(row);
  }

  if (currentGroup.length) {
    groups.push(currentGroup);
  }

  return groups;
};

const parseWorkoutGroups = () =>
  readWorkoutGroups().map((rows, index) => {
    const meta = WORKOUT_META[index] ?? {
      id: `treino-${index + 1}`,
      name: `Treino ${index + 1}`,
      subtitle: 'Importado da planilha',
      accent: '#f09a36'
    };

    return {
      ...meta,
      exercises: rows.map((row) => {
        const name = formatCellValue(row[0]);
        const id = slugify(name);
        const enrichment = EXERCISE_ENRICHMENTS[id] ?? {
          focus: 'Execucao guiada',
          cue: 'Use a referencia do video para revisar a execucao antes de iniciar.',
          aliases: [name]
        };
        const seedSets = [];

        for (let cellIndex = 3; cellIndex <= 15; cellIndex += 2) {
          const load = formatCellValue(row[cellIndex]);
          const reps = formatCellValue(row[cellIndex + 1]);

          if (!load && !reps) {
            continue;
          }

          seedSets.push({ load, reps });
        }

        return {
          id,
          name,
          focus: enrichment.focus,
          cue: enrichment.cue,
          aliases: enrichment.aliases,
          seedSets
        };
      })
    };
  });

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

const main = async () => {
  const workouts = parseWorkoutGroups();
  const catalogMap = await readCatalogLinks();
  const missingCatalog = [];

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
        focus: exercise.focus,
        cue: exercise.cue,
        seedSets: exercise.seedSets,
        videoUrl: catalogEntry?.videoUrl,
        thumbnailUrl: catalogEntry?.thumbnailUrl,
        catalogLabel: catalogEntry?.catalogLabel,
        catalogPage: catalogEntry?.catalogPage
      };
    })
  }));

  const payload = {
    generatedAt: new Date().toISOString(),
    sourceWorkbook: WORKBOOK_PATH,
    sourceCatalog: CATALOG_PATH,
    workouts: importedWorkouts
  };

  await fs.writeFile(OUTPUT_PATH, `${JSON.stringify(payload, null, 2)}\n`);

  const uniqueMissing = [...new Set(missingCatalog)];

  console.log(`Imported ${importedWorkouts.length} workouts and ${catalogMap.size} catalog links.`);

  if (uniqueMissing.length) {
    console.warn(`Catalog links missing for: ${uniqueMissing.join(', ')}`);
  }
};

await main();