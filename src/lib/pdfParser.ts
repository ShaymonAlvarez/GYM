import * as pdfjsLib from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { WorkoutTemplate, ExerciseTemplate } from '../types';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

// ═══════════════════════════════════════════
// PUBLIC API
// ═══════════════════════════════════════════

export async function parseWorkoutPdf(file: File): Promise<WorkoutTemplate[]> {
  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) });
  const pdfDocument = await loadingTask.promise;

  let fullText = '';
  for (let i = 1; i <= pdfDocument.numPages; i++) {
    const page = await pdfDocument.getPage(i);
    const textContent = await page.getTextContent();
    const pageText = textContent.items
      .map((item: any) => ('str' in item ? item.str : ''))
      .join(' ');
    fullText += ` ${pageText} `;
  }

  return parseTextToTemplates(fullText);
}

// ═══════════════════════════════════════════
// INTERNAL PARSER
// ═══════════════════════════════════════════

interface DataRow {
  sets: string;
  reps: string;
  interval: string;
  rir: string;
  fullMatch: string;
  startIndex: number;
  endIndex: number;
}

/**
 * Regex to match a data row: [sets] [reps] [interval] [RIR]
 * 
 * sets:     "1 a 3" or "2" or "1"
 * reps:     "6-12" or "8-10"
 * interval: "1'a 2'" or "2'a 3'" or "2'a 5'" (with various quote chars)
 * rir:      "4-5" or "2-3" or "0-1"
 */
const DATA_ROW_REGEX = /(\d+\s*a\s*\d+|\d+)\s+(\d+\s*-\s*\d+)\s+(\d+['\u2018\u2019']\s*a\s*\d+['\u2018\u2019']?)\s+(\d+\s*-\s*\d+)/g;

function findDataRows(text: string): DataRow[] {
  const rows: DataRow[] = [];
  let match: RegExpExecArray | null;

  // Reset regex state
  DATA_ROW_REGEX.lastIndex = 0;

  while ((match = DATA_ROW_REGEX.exec(text)) !== null) {
    rows.push({
      sets: match[1].replace(/\s/g, ''),
      reps: match[2].replace(/\s/g, ''),
      interval: match[3],
      rir: match[4].replace(/\s/g, ''),
      fullMatch: match[0],
      startIndex: match.index,
      endIndex: match.index + match[0].length
    });
  }

  return rows;
}

function extractExerciseName(text: string): string {
  // Clean up the text: collapse whitespace, trim
  return text.replace(/\s+/g, ' ').trim();
}

function isExerciseName(text: string): boolean {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (cleaned.length < 2) return false;

  // Must be predominantly uppercase letters (with accented chars)
  const upperCount = (cleaned.match(/[A-ZÇÃÕÉÍÓÚÂÊÔ]/g) || []).length;
  const totalChars = cleaned.replace(/[\s\/]/g, '').length;
  
  return totalChars > 0 && (upperCount / totalChars) > 0.7;
}

function parseSetsCount(setsStr: string): number {
  if (setsStr.includes('a')) {
    const parts = setsStr.split('a').map(p => parseInt(p.trim(), 10));
    return (parts[1] || 1) - (parts[0] || 1) + 1;
  }
  return parseInt(setsStr, 10) || 1;
}

/**
 * Classify a set band by its RIR, the way the PDF colors the rows:
 *   RIR 4-5 → yellow (warmup) · RIR 2-3 → orange (working) · RIR 0-1 → red (failure).
 * The lower bound of the RIR range is enough to pick the band. Classifying by RIR
 * (instead of row position) handles exercises that skip a band — e.g. only
 * yellow + red, with no orange row.
 */
function classifySetType(rir: string): 'yellow' | 'orange' | 'red' {
  const lower = parseInt(rir, 10); // "4-5" → 4, "2-3" → 2, "0-1" → 0
  if (Number.isNaN(lower)) return 'orange';
  if (lower >= 4) return 'yellow';
  if (lower >= 2) return 'orange';
  return 'red';
}

function buildExercise(
  letter: string,
  rowNumber: number,
  name: string,
  notes: string,
  dataRows: DataRow[]
): ExerciseTemplate {
  // Each row's band comes from its RIR (see classifySetType); the SERIES column
  // gives how many sets that band has. Counts accumulate per band.
  let yellowSets = 0;
  let orangeSets = 0;
  let redSets = 0;

  const setDetails: any = {};

  for (const row of dataRows) {
    const count = parseSetsCount(row.sets);
    const details = { reps: row.reps, rest: row.interval, rir: row.rir };
    const type = classifySetType(row.rir);

    if (type === 'yellow') {
      yellowSets += count;
      setDetails.yellow = details;
    } else if (type === 'orange') {
      orangeSets += count;
      setDetails.orange = details;
    } else {
      redSets += count;
      setDetails.red = details;
    }
  }

  const totalSets = yellowSets + orangeSets + redSets;

  return {
    id: `ex-${letter}-${rowNumber}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name: name.trim(),
    rowNumber,
    focus: 'Geral',
    cue: '',
    yellowSetCount: yellowSets,
    orangeSetCount: orangeSets,
    redSetCount: redSets,
    activeSlotIndices: Array.from({ length: totalSets }, (_, i) => i),
    setDetails,
    pdfNotes: notes.trim() || undefined,
  };
}

function parseTextToTemplates(text: string): WorkoutTemplate[] {
  const templates: WorkoutTemplate[] = [];
  
  // Normalize all whitespace to single spaces
  const normalized = text.replace(/\s+/g, ' ');
  
  // Split by "TREINO X" markers
  const workoutChunks = normalized.split(/TREINO\s+([A-Z])/);
  // workoutChunks = ['...before...', 'A', '...content...', 'B', '...content...', ...]
  const parts = workoutChunks.slice(1);

  for (let i = 0; i < parts.length; i += 2) {
    const letter = parts[i];
    let content = parts[i + 1] || '';

    // Remove header row
    content = content.replace(/SERIES\s+REPETIÇÕES\s+INTERVALO\s+RIR(\s+MÉTODO)?/gi, '').trim();

    // Find all data rows using regex
    const dataRows = findDataRows(content);

    if (dataRows.length === 0) continue;

    // Now walk through the content, grouping data rows by exercise
    const exercises: ExerciseTemplate[] = [];
    let currentName = '';
    let currentNotes = '';
    let currentRows: DataRow[] = [];
    let lastEnd = 0;

    for (const row of dataRows) {
      // Get text between last data row and this one
      const between = content.substring(lastEnd, row.startIndex).trim();
      lastEnd = row.endIndex;

      if (between && isExerciseName(between)) {
        // Save previous exercise if we have one
        if (currentName && currentRows.length > 0) {
          exercises.push(
            buildExercise(letter, exercises.length + 1, currentName, currentNotes, currentRows)
          );
          currentRows = [];
          currentNotes = '';
        }
        currentName = extractExerciseName(between);
      } else if (between) {
        // It's a note (e.g. "Se tiver maquina pode usar...")
        currentNotes += between + ' ';
      }

      currentRows.push(row);
    }

    // Don't forget the last exercise
    if (currentName && currentRows.length > 0) {
      exercises.push(
        buildExercise(letter, exercises.length + 1, currentName, currentNotes, currentRows)
      );
    }

    if (exercises.length > 0) {
      templates.push({
        id: `workout-${letter}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name: `Treino ${letter}`,
        subtitle: `${exercises.length} exercícios`,
        accent: ['blue', 'green', 'purple', 'orange'][templates.length % 4] || 'blue',
        exercises,
      });
    }
  }

  return templates;
}
