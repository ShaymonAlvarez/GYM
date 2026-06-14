import type { FeedbackState } from '../types';

export const FEEDBACK_WEEK_COUNT = 6;

const GOOD_AVERAGE_BAD = ['Boa', 'Media', 'Ruim'];
const GOOD_AVERAGE_BAD_MASCULINE = ['Bom', 'Medio', 'Ruim'];
const YES_NO = ['Sim', 'Não'];
const DURATION_OPTIONS = ['Posso um pouco mais', 'Tempo justo', 'Demorando mais que posso'];

export const FEEDBACK_QUESTIONS = [
  { rowNumber: 3, text: 'Assiduidade ao treino', fullText: 'Como foi sua assiduidade ao treino?', options: GOOD_AVERAGE_BAD },
  { rowNumber: 4, text: 'Desempenho nos treinos', fullText: 'Como foi seu desempenho nos treinos?', options: GOOD_AVERAGE_BAD_MASCULINE },
  { rowNumber: 5, text: 'Recuperacao da semana', fullText: 'Como foi sua recuperação ao longo da semana?', options: GOOD_AVERAGE_BAD },
  { rowNumber: 6, text: 'Exercicio que nao gosta', fullText: 'Tem algum exercício que não goste? (Se sim, descreva nos comentários)', options: YES_NO },
  { rowNumber: 7, text: 'Dificuldade de execucao', fullText: 'Tem algum exercício que esteja com dificuldade de execução? (Se sim, descreva nos comentários)', options: YES_NO },
  { rowNumber: 8, text: 'Exercicio para o proximo bloco', fullText: 'Tem algum exercício que você gostaria de ter no próximo bloco? Pode ser um que já faz ou não. (Se sim, descreva nos comentários)', options: YES_NO },
  { rowNumber: 9, text: 'Tempo de duracao dos treinos', fullText: 'Como está o tempo de duração dos treinos? (Se tiver mais tempo ou estiver longo demais, descreva quanto nos comentários)', options: DURATION_OPTIONS },
  { rowNumber: 10, text: 'Videos enviados', fullText: 'Você enviou vídeos do treino?', options: YES_NO },
  { rowNumber: 11, text: 'Contato em caso de duvidas', fullText: 'Você manteve contato quando teve dúvidas?', options: YES_NO },
  { rowNumber: 12, text: 'Dor ou desconforto', fullText: 'Você está sentindo alguma dor ou desconforto?', options: YES_NO },
  { rowNumber: 13, text: 'Sono', fullText: 'Como foi o seu sono?', options: GOOD_AVERAGE_BAD_MASCULINE },
  { rowNumber: 14, text: 'Dieta', fullText: 'Como foi a dieta?', options: GOOD_AVERAGE_BAD },
  { rowNumber: 15, text: 'Progressao da semana', fullText: 'Você está satisfeito(a) com a progressão da semana?', options: YES_NO }
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
