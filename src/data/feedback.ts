import type { FeedbackState } from '../types';

export const FEEDBACK_WEEK_COUNT = 6;

const GOOD_AVERAGE_BAD = ['Boa', 'Media', 'Ruim'];
const GOOD_AVERAGE_BAD_MASCULINE = ['Bom', 'Medio', 'Ruim'];
const YES_NO = ['Sim', 'Não'];
const DURATION_OPTIONS = ['Posso um pouco mais', 'Tempo justo', 'Demorando mais que posso'];

export const FEEDBACK_QUESTIONS = [
  { rowNumber: 3, text: 'Assiduidade ao treino', options: GOOD_AVERAGE_BAD },
  { rowNumber: 4, text: 'Desempenho nos treinos', options: GOOD_AVERAGE_BAD_MASCULINE },
  { rowNumber: 5, text: 'Recuperacao da semana', options: GOOD_AVERAGE_BAD },
  { rowNumber: 6, text: 'Exercicio que nao gosta', options: YES_NO },
  { rowNumber: 7, text: 'Dificuldade de execucao', options: YES_NO },
  { rowNumber: 8, text: 'Exercicio para o proximo bloco', options: YES_NO },
  { rowNumber: 9, text: 'Tempo de duracao dos treinos', options: DURATION_OPTIONS },
  { rowNumber: 10, text: 'Videos enviados', options: YES_NO },
  { rowNumber: 11, text: 'Contato em caso de duvidas', options: YES_NO },
  { rowNumber: 12, text: 'Dor ou desconforto', options: YES_NO },
  { rowNumber: 13, text: 'Sono', options: GOOD_AVERAGE_BAD_MASCULINE },
  { rowNumber: 14, text: 'Dieta', options: GOOD_AVERAGE_BAD },
  { rowNumber: 15, text: 'Progressao da semana', options: YES_NO }
];

export const FEEDBACK_WEEK_COLUMNS = ['B', 'C', 'D', 'E', 'F', 'G'];
export const COMMENT_WEEK_START_ROWS = [3, 13, 23, 33, 43, 53];
export const PHOTO_NOTE_ROW = 73;

export const createEmptyFeedbackState = (weekCount = FEEDBACK_WEEK_COLUMNS.length): FeedbackState => ({
  weeklyAnswers: Array.from({ length: weekCount }, () =>
    Array.from({ length: FEEDBACK_QUESTIONS.length }, () => '')
  ),
  weeklyComments: Array.from({ length: weekCount }, () => ''),
  photoNote: ''
});

export const normalizeFeedbackState = (
  feedback: FeedbackState | undefined,
  weekCount = FEEDBACK_WEEK_COLUMNS.length
): FeedbackState => {
  const emptyFeedback = createEmptyFeedbackState(weekCount);

  return {
    weeklyAnswers: emptyFeedback.weeklyAnswers.map((emptyWeek, weekIndex) =>
      emptyWeek.map((emptyValue, questionIndex) => feedback?.weeklyAnswers?.[weekIndex]?.[questionIndex] ?? emptyValue)
    ),
    weeklyComments: emptyFeedback.weeklyComments.map(
      (emptyValue, weekIndex) => feedback?.weeklyComments?.[weekIndex] ?? emptyValue
    ),
    photoNote: feedback?.photoNote ?? ''
  };
};
