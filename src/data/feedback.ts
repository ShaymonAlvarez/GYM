import type { FeedbackState } from '../types';

export const FEEDBACK_WEEK_COUNT = 6;
export const MAX_WEEK_COUNT = 7;

const GOOD_AVERAGE_BAD = ['Boa', 'Media', 'Ruim'];
const GOOD_AVERAGE_BAD_MASCULINE = ['Bom', 'Medio', 'Ruim'];
const YES_NO = ['Sim', 'Não'];
const DURATION_OPTIONS = ['Posso um pouco mais', 'Tempo justo', 'Demorando mais que posso'];
const AVERAGE_DURATION_OPTIONS = ['até 60min', '60-75min', '75-90min', '90-105min', '105-120min', 'mais de 120min'];

export type FeedbackQuestion = {
  /** Linha na aba de feedback da planilha exportada. */
  rowNumber: number;
  /**
   * Posição da resposta em FeedbackState.weeklyAnswers. É fixa: perguntas novas
   * recebem o próximo índice livre mesmo aparecendo no meio da lista, para que as
   * respostas já salvas nunca mudem de pergunta.
   */
  answerIndex: number;
  text: string;
  fullText: string;
  options: string[];
  /** 'select' para perguntas com muitas opções (lista suspensa em vez de ícones). */
  input?: 'buttons' | 'select';
  /**
   * Cor de cada opção (mesma ordem de options) conforme a formatação condicional da
   * planilha. Sem tons, a célula fica sem cor.
   */
  tones?: FeedbackTone[];
};

export type FeedbackTone = 'good' | 'neutral' | 'bad';

const GOOD_NEUTRAL_BAD: FeedbackTone[] = ['good', 'neutral', 'bad'];
// "Sim" é ruim em perguntas sobre problemas (não gosta, dificuldade, dor…).
const YES_IS_GOOD: FeedbackTone[] = ['good', 'bad'];
const YES_IS_BAD: FeedbackTone[] = ['bad', 'good'];

// Na ordem da planilha do bloco atual.
export const FEEDBACK_QUESTIONS: FeedbackQuestion[] = [
  { rowNumber: 3, answerIndex: 0, text: 'Assiduidade ao treino', fullText: 'Como foi sua assiduidade ao treino?', options: GOOD_AVERAGE_BAD, tones: GOOD_NEUTRAL_BAD },
  { rowNumber: 4, answerIndex: 1, text: 'Desempenho nos treinos', fullText: 'Como foi seu desempenho nos treinos?', options: GOOD_AVERAGE_BAD_MASCULINE, tones: GOOD_NEUTRAL_BAD },
  { rowNumber: 5, answerIndex: 2, text: 'Recuperacao da semana', fullText: 'Como foi sua recuperação ao longo da semana?', options: GOOD_AVERAGE_BAD, tones: GOOD_NEUTRAL_BAD },
  { rowNumber: 6, answerIndex: 3, text: 'Exercicio que nao gosta', fullText: 'Tem algum exercício que não goste? (Se sim, descreva nos comentários)', options: YES_NO, tones: YES_IS_BAD },
  { rowNumber: 7, answerIndex: 4, text: 'Dificuldade de execucao', fullText: 'Tem algum exercício que esteja com dificuldade de execução? (Se sim, descreva nos comentários)', options: YES_NO, tones: YES_IS_BAD },
  { rowNumber: 8, answerIndex: 5, text: 'Exercicio para o proximo bloco', fullText: 'Tem algum exercício que você gostaria de ter no próximo bloco? Pode ser um que já faz ou não. (Se sim, descreva nos comentários)', options: YES_NO, tones: YES_IS_BAD },
  { rowNumber: 9, answerIndex: 6, text: 'Tempo de duracao dos treinos', fullText: 'Como está o tempo de duração dos treinos? (Se tiver mais tempo ou estiver longo demais, descreva quanto nos comentários)', options: DURATION_OPTIONS, tones: GOOD_NEUTRAL_BAD },
  { rowNumber: 10, answerIndex: 13, text: 'Duração média do treino', fullText: 'Quanto tempo o treino leva em média? (Descreva nos comentários se houverem sessões específicas que duram mais ou menos)', options: AVERAGE_DURATION_OPTIONS, input: 'select' },
  { rowNumber: 11, answerIndex: 7, text: 'Videos enviados', fullText: 'Você enviou vídeos do treino?', options: YES_NO, tones: YES_IS_GOOD },
  { rowNumber: 12, answerIndex: 8, text: 'Contato em caso de duvidas', fullText: 'Você manteve contato quando teve dúvidas?', options: YES_NO, tones: YES_IS_GOOD },
  { rowNumber: 13, answerIndex: 9, text: 'Dor ou desconforto', fullText: 'Você está sentindo alguma dor ou desconforto?', options: YES_NO, tones: YES_IS_BAD },
  { rowNumber: 14, answerIndex: 10, text: 'Sono', fullText: 'Como foi o seu sono?', options: GOOD_AVERAGE_BAD_MASCULINE, tones: GOOD_NEUTRAL_BAD },
  { rowNumber: 15, answerIndex: 11, text: 'Dieta', fullText: 'Como foi a dieta?', options: GOOD_AVERAGE_BAD, tones: GOOD_NEUTRAL_BAD },
  { rowNumber: 16, answerIndex: 12, text: 'Progressao da semana', fullText: 'Você está satisfeito(a) com a progressão da semana?', options: YES_NO, tones: YES_IS_GOOD }
];

export const getFeedbackTone = (question: FeedbackQuestion, answer: string): FeedbackTone | null => {
  const optionIndex = question.options.findIndex((option) => option.toLowerCase() === answer.trim().toLowerCase());
  return optionIndex >= 0 ? question.tones?.[optionIndex] ?? null : null;
};

/** Pergunta que não existe na planilha modelo: a linha é inserida na exportação. */
export const FEEDBACK_TEMPLATE_MISSING_QUESTION = FEEDBACK_QUESTIONS.find((question) => question.answerIndex === 13)!;

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
