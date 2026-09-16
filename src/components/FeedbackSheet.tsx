import type { FeedbackState, WeekLog } from '../types';
import { getFeedbackTone } from '../data/feedback';
import type { FeedbackQuestion } from '../data/feedback';

type FeedbackSheetProps = {
  questions: FeedbackQuestion[];
  weeks: WeekLog[];
  feedbackState: FeedbackState;
};

/**
 * Aba "Feedback do período" no mesmo formato da planilha: cabeçalho preto, perguntas
 * em amarelo e respostas coloridas como a formatação condicional do Excel.
 */
function FeedbackSheet({ questions, weeks, feedbackState }: FeedbackSheetProps) {
  return (
    <div className="feedback-sheet-shell">
      <p className="feedback-sheet__title">Feedback do período</p>
      <table className="feedback-sheet">
        <thead>
          <tr>
            <th className="feedback-sheet__corner" />
            {weeks.map((week) => (
              <th key={week.index} className="feedback-sheet__week">
                {week.label}
                {week.index === 5 ? <span className="feedback-sheet__photos"> FOTOS</span> : null}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {questions.map((question) => (
            <tr key={question.rowNumber}>
              <th scope="row" className="feedback-sheet__question">
                {question.fullText}
              </th>
              {weeks.map((week) => {
                const answer = feedbackState.weeklyAnswers[week.index]?.[question.answerIndex] ?? '';
                const tone = answer ? getFeedbackTone(question, answer) : null;
                return (
                  <td key={week.index} className={`feedback-sheet__answer${tone ? ` feedback-sheet__answer--${tone}` : ''}`}>
                    {answer}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default FeedbackSheet;
