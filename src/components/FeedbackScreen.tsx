import type { FeedbackState } from '../types';

type FeedbackQuestion = {
  rowNumber: number;
  text: string;
  options: string[];
};

type FeedbackScreenProps = {
  activeWeekLabel: string;
  activeWeekIndex: number;
  questions: FeedbackQuestion[];
  activeFeedbackAnswers: string[];
  weeklyComment: string;
  feedbackState: FeedbackState;
  onAnswerChange: (questionIndex: number, value: string) => void;
  onCommentChange: (value: string) => void;
  onPhotoNoteChange: (value: string) => void;
};

function FeedbackScreen({
  activeWeekLabel,
  activeWeekIndex,
  questions,
  activeFeedbackAnswers,
  weeklyComment,
  feedbackState,
  onAnswerChange,
  onCommentChange,
  onPhotoNoteChange
}: FeedbackScreenProps) {
  return (
    <div className="screen" key="feedback">
      <div>
        <p className="section-label">Feedback</p>
        <div className="section-title">
          <h2>{activeWeekLabel}</h2>
        </div>
      </div>

      <div className="card">
        <div className="feedback-grid">
          {questions.map((question, questionIndex) => (
            <div key={question.rowNumber} className="feedback-field">
              <span>{question.text}</span>
              <select
                value={activeFeedbackAnswers[questionIndex] ?? ''}
                onChange={(event) => onAnswerChange(questionIndex, event.target.value)}
              >
                <option value="">Selecione</option>
                {question.options.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="feedback-field feedback-field--wide">
          <span>Comentários da {activeWeekLabel}</span>
          <textarea
            rows={4}
            value={weeklyComment}
            onChange={(event) => onCommentChange(event.target.value)}
          />
        </div>
      </div>

      {activeWeekIndex === 5 ? (
        <div className="card">
          <div className="feedback-field feedback-field--wide">
            <span>Semana 6 — fotos</span>
            <textarea
              rows={3}
              value={feedbackState.photoNote}
              onChange={(event) => onPhotoNoteChange(event.target.value)}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default FeedbackScreen;
