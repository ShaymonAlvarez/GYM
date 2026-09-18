// Gera src/data/exerciseCatalog.generated.ts a partir do "Catálogo de exercícios.pdf"
// do treinador (cada rótulo do PDF é um link para o vídeo de execução).
// O PDF é um material local que não vai para o repositório — por isso o catálogo é
// gerado e commitado. Rode: node scripts/build-exercise-catalog.mjs

import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { getDocument } = require('pdfjs-dist/legacy/build/pdf.mjs');

const OUTPUT_PATH = path.resolve('src/data/exerciseCatalog.generated.ts');

const findCatalogPath = async () => {
  const entry = (await fs.readdir('.')).find((name) => name.toLowerCase().includes('logo de exerc') && name.endsWith('.pdf'));
  if (!entry) {
    throw new Error('Catálogo de exercícios.pdf não encontrado na raiz do projeto.');
  }
  return entry;
};

const buildThumbnailUrl = (url) => {
  const videoId =
    /youtu\.be\/([\w-]{6,})/.exec(url)?.[1] ??
    /[?&]v=([\w-]{6,})/.exec(url)?.[1] ??
    /shorts\/([\w-]{6,})/.exec(url)?.[1];

  return videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : undefined;
};

const readCatalog = async (catalogPath) => {
  const data = new Uint8Array(await fs.readFile(catalogPath));
  const pdf = await getDocument({ data }).promise;
  const entries = [];
  const seen = new Set();

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);

    for (const annotation of await page.getAnnotations()) {
      if (!annotation.url || !annotation.overlaidText) continue;

      // "Crucifixo" vem com ligadura (ﬁ) no PDF; normaliza para texto comum.
      const label = String(annotation.overlaidText).normalize('NFKC').replace(/\s+/g, ' ').trim();
      const key = label.toLowerCase();

      if (!label || seen.has(key) || pageNumber < 7) continue;
      seen.add(key);

      entries.push({ label, page: pageNumber, videoUrl: annotation.url, thumbnailUrl: buildThumbnailUrl(annotation.url) });
    }
  }

  return entries;
};

const serialize = (entries) => {
  const rows = entries
    .map((entry) => {
      const thumbnail = entry.thumbnailUrl ? `, thumbnailUrl: ${JSON.stringify(entry.thumbnailUrl)}` : '';
      return `  { label: ${JSON.stringify(entry.label)}, page: ${entry.page}, videoUrl: ${JSON.stringify(entry.videoUrl)}${thumbnail} }`;
    })
    .join(',\n');

  return `// GERADO AUTOMATICAMENTE por scripts/build-exercise-catalog.mjs — não edite à mão.
// Fonte: "Catálogo de exercícios.pdf" (material do treinador, fora do repositório).

export type CatalogEntry = {
  label: string;
  page: number;
  videoUrl: string;
  thumbnailUrl?: string;
};

export const EXERCISE_CATALOG: CatalogEntry[] = [
${rows}
];
`;
};

const catalogPath = await findCatalogPath();
const entries = await readCatalog(catalogPath);

if (entries.length < 100) {
  throw new Error(`Só ${entries.length} exercícios lidos do catálogo — algo deu errado.`);
}

await fs.writeFile(OUTPUT_PATH, serialize(entries), 'utf8');
console.log(`${entries.length} exercícios gravados em ${path.relative('.', OUTPUT_PATH)}.`);
