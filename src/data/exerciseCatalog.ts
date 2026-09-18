import { EXERCISE_CATALOG } from './exerciseCatalog.generated';
import type { CatalogEntry } from './exerciseCatalog.generated';

export type ExerciseVideo = {
  videoUrl?: string;
  thumbnailUrl?: string;
  catalogLabel?: string;
  catalogPage?: number;
};

// Abreviações usadas nos PDFs de treino que não aparecem no catálogo.
const ABBREVIATIONS: Array<[RegExp, string]> = [
  [/\bC\s*\/\s*H\b/g, ' COM HALTER '],
  [/\bC\s*\/\s*B\b/g, ' COM BARRA '],
  [/\bC\s*\/\s*C\b/g, ' COM CORDA '],
  [/\bMAQ\b/g, ' MAQUINA '],
  [/\bUNI\b/g, ' UNILATERAL '],
  [/\bHALTERES\b/g, ' HALTER ']
];

// Palavras de ligação: não ajudam a diferenciar exercícios ("agachamento NO smith").
const STOP_WORDS = new Set(['NO', 'NA', 'EM', 'DE', 'DO', 'DA', 'COM', 'E', 'A', 'O', 'OS', 'AS', 'UM', 'UMA']);

const normalize = (name: string): string => {
  let value = name
    .normalize('NFKC')
    .toUpperCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, ''); // remove acentos

  ABBREVIATIONS.forEach(([pattern, replacement]) => {
    value = value.replace(pattern, replacement);
  });

  return value.replace(/[^A-Z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
};

const tokenize = (name: string): string[] => {
  const tokens = normalize(name).split(' ').filter((token) => token && !STOP_WORDS.has(token));
  return tokens.length ? tokens : normalize(name).split(' ').filter(Boolean);
};

type IndexedEntry = CatalogEntry & { tokens: string[]; key: string };

const INDEX: IndexedEntry[] = EXERCISE_CATALOG.map((entry) => {
  const tokens = tokenize(entry.label);
  return { ...entry, tokens, key: tokens.join(' ') };
});

const toVideo = (entry: CatalogEntry): ExerciseVideo => ({
  videoUrl: entry.videoUrl,
  thumbnailUrl: entry.thumbnailUrl,
  catalogLabel: entry.label,
  catalogPage: entry.page
});

/** Proporção de palavras em comum (Jaccard) entre o exercício e o rótulo do catálogo. */
const similarity = (queryTokens: string[], entryTokens: string[]): number => {
  const query = new Set(queryTokens);
  const entry = new Set(entryTokens);
  let shared = 0;
  query.forEach((token) => {
    if (entry.has(token)) shared += 1;
  });
  return shared / (query.size + entry.size - shared);
};

const MIN_SIMILARITY = 0.5;

/**
 * Procura o vídeo de execução pelo nome do exercício. Primeiro tenta o nome exato
 * (sem acentos/abreviações) e depois o rótulo mais parecido do catálogo — preferindo
 * a variação mais simples, para "LEG PRESS HORIZONTAL" cair em "Leg press" e não em
 * "Leg press unilateral horizonta".
 */
export function lookupExerciseVideo(name: string): ExerciseVideo {
  const tokens = tokenize(name);

  if (!tokens.length) return {};

  const key = tokens.join(' ');
  const exact = INDEX.find((entry) => entry.key === key);

  if (exact) return toVideo(exact);

  // Rótulo que começa com o nome procurado: "TRICEPS POLIA" → "Tríceps polia barra".
  // Entre vários, o mais curto (a variação mais básica).
  const prefixed = INDEX.filter((entry) => entry.key.startsWith(`${key} `)).sort(
    (first, second) => first.tokens.length - second.tokens.length
  )[0];

  if (prefixed) return toVideo(prefixed);

  let best: IndexedEntry | null = null;
  let bestScore = 0;

  for (const entry of INDEX) {
    const score = similarity(tokens, entry.tokens);

    if (
      score > bestScore ||
      (score === bestScore && best && entry.tokens.length < best.tokens.length)
    ) {
      best = entry;
      bestScore = score;
    }
  }

  return best && bestScore >= MIN_SIMILARITY ? toVideo(best) : {};
}
