type CatalogEntry = { videoUrl: string; thumbnailUrl: string };

const CATALOG: Record<string, CatalogEntry> = {
  'CADEIRA ABDUTORA':       { videoUrl: 'https://youtu.be/VpcT1v-079w',      thumbnailUrl: 'https://i.ytimg.com/vi/VpcT1v-079w/hqdefault.jpg' },
  'ELEVACAO PELVICA':       { videoUrl: 'https://youtu.be/Zp26q4BY5HE',      thumbnailUrl: 'https://i.ytimg.com/vi/Zp26q4BY5HE/hqdefault.jpg' },
  'LEG PRESS':              { videoUrl: 'https://youtu.be/fM2WvgirlLM',      thumbnailUrl: 'https://i.ytimg.com/vi/fM2WvgirlLM/hqdefault.jpg' },
  'CADEIRA EXTENSORA':      { videoUrl: 'https://youtu.be/pJZXbaF-MCM',      thumbnailUrl: 'https://i.ytimg.com/vi/pJZXbaF-MCM/hqdefault.jpg' },
  'CADEIRA FLEXORA':        { videoUrl: 'https://youtu.be/-EIXZD5AEuE',      thumbnailUrl: 'https://i.ytimg.com/vi/-EIXZD5AEuE/hqdefault.jpg' },
  'ELEVACAO LATERAL':       { videoUrl: 'https://youtu.be/qDAoUOmdbi4',      thumbnailUrl: 'https://i.ytimg.com/vi/qDAoUOmdbi4/hqdefault.jpg' },
  'SUPINO RETO MAQUINA':    { videoUrl: 'https://youtu.be/0CFOTfwP4CY',      thumbnailUrl: 'https://i.ytimg.com/vi/0CFOTfwP4CY/hqdefault.jpg' },
  'PUXADA PRONADA POLIA':   { videoUrl: 'https://youtu.be/WjSVqshIaBo',      thumbnailUrl: 'https://i.ytimg.com/vi/WjSVqshIaBo/hqdefault.jpg' },
  'REMADA SERROTE':         { videoUrl: 'https://youtu.be/EUisRaNkCd4',      thumbnailUrl: 'https://i.ytimg.com/vi/EUisRaNkCd4/hqdefault.jpg' },
  'ROSCA DIRETA POLIA':     { videoUrl: 'https://youtu.be/_ziU37WD50I',      thumbnailUrl: 'https://i.ytimg.com/vi/_ziU37WD50I/hqdefault.jpg' },
  'RDL':                    { videoUrl: 'https://youtu.be/HCIAl9ro2p4?t=47', thumbnailUrl: 'https://i.ytimg.com/vi/HCIAl9ro2p4/hqdefault.jpg' },
  'MESA FLEXORA':           { videoUrl: 'https://youtu.be/n5WDXD_mpVY',      thumbnailUrl: 'https://i.ytimg.com/vi/n5WDXD_mpVY/hqdefault.jpg' },
  'DESENVOLVIMENTO':        { videoUrl: 'https://youtu.be/L-iQfHVeuVg',      thumbnailUrl: 'https://i.ytimg.com/vi/L-iQfHVeuVg/hqdefault.jpg' },
  'PUXADA NEUTRA POLIA':    { videoUrl: 'https://youtu.be/dgCYN_JBk44',      thumbnailUrl: 'https://i.ytimg.com/vi/dgCYN_JBk44/hqdefault.jpg' },
  'REMADA PRONADA MAQUINA': { videoUrl: 'https://youtu.be/ahBaYwptV-Q',      thumbnailUrl: 'https://i.ytimg.com/vi/ahBaYwptV-Q/hqdefault.jpg' },
  'TRICEPS POLIA':          { videoUrl: 'https://youtu.be/lr_BEvE3iBQ',      thumbnailUrl: 'https://i.ytimg.com/vi/lr_BEvE3iBQ/hqdefault.jpg' },
};

function normalizeForLookup(name: string): string {
  return name
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip accents
    .replace(/[^A-Z0-9\s]/g, ' ')   // remove special chars (/, ç ligatures, etc.)
    .replace(/\s+/g, ' ')
    .trim();
}

export function lookupExerciseVideo(name: string): Partial<CatalogEntry> {
  const normalized = normalizeForLookup(name);

  if (CATALOG[normalized]) return CATALOG[normalized];

  // Allow catalog key to be a word-boundary prefix of the exercise name
  // e.g. "ELEVACAO LATERAL" matches "ELEVACAO LATERAL C H" or "ELEVACAO LATERAL COM HALTER"
  for (const [key, entry] of Object.entries(CATALOG)) {
    if (normalized === key || normalized.startsWith(key + ' ')) {
      return entry;
    }
  }

  return {};
}
