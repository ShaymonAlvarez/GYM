import type { FeedbackState } from '../types';

export const FEEDBACK_QUESTIONS = [
  { rowNumber: 3, text: 'Como foi sua assiduidade ao treino?' },
  { rowNumber: 4, text: 'Como foi seu desempenho nos treinos?' },
  { rowNumber: 5, text: 'Como foi sua recuperacao ao longo da semana?' },
  { rowNumber: 6, text: 'Tem algum exercicio que nao goste?' },
  { rowNumber: 7, text: 'Tem algum exercicio com dificuldade de execucao?' },
  { rowNumber: 8, text: 'Tem algum exercicio que gostaria no proximo bloco?' },
  { rowNumber: 9, text: 'Como esta o tempo de duracao dos treinos?' },
  { rowNumber: 10, text: 'Voce enviou videos do treino?' },
  { rowNumber: 11, text: 'Voce manteve contato quando teve duvidas?' },
  { rowNumber: 12, text: 'Voce esta sentindo alguma dor ou desconforto?' },
  { rowNumber: 13, text: 'Como foi seu sono?' },
  { rowNumber: 14, text: 'Como foi a dieta?' },
  { rowNumber: 15, text: 'Voce esta satisfeito(a) com a progressao da semana?' }
];

export const FEEDBACK_WEEK_COLUMNS = ['B', 'C', 'D', 'E', 'F', 'G', 'H'];
export const COMMENT_WEEK_START_ROWS = [3, 13, 23, 33, 43, 53, 63];
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
