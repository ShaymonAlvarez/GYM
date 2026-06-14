import { useState } from 'react';
import type { AppState } from '../types';
import type { FeedbackState } from '../types';
import CustomSelect from './CustomSelect';

type FeedbackQuestion = {
  rowNumber: number;
  text: string;
  fullText?: string;
  options: string[];
};

type FeedbackScreenProps = {
  appState: AppState;
  questions: FeedbackQuestion[];
  activeFeedbackAnswers: string[];
  weeklyComment: string;
  feedbackState: FeedbackState;
  onAnswerChange: (questionIndex: number, value: string) => void;
  onCommentChange: (value: string) => void;
  onPhotoNoteChange: (value: string) => void;
  onWeekChange: (index: number) => void;
  onClearFeedback: () => void;
};

const SmileIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="9"/>
    <path d="M8 14s1.5 2 4 2 4-2 4-2"/>
    <line x1="9" y1="9" x2="9.01" y2="9"/>
    <line x1="15" y1="9" x2="15.01" y2="9"/>
  </svg>
);

const MehIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="9"/>
    <line x1="8" y1="15" x2="16" y2="15"/>
    <line x1="9" y1="9" x2="9.01" y2="9"/>
    <line x1="15" y1="9" x2="15.01" y2="9"/>
  </svg>
);

const FrownIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="9"/>
    <path d="M16 16s-1.5-2-4-2-4 2-4 2"/>
    <line x1="9" y1="9" x2="9.01" y2="9"/>
    <line x1="15" y1="9" x2="15.01" y2="9"/>
  </svg>
);

const CheckIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12"/>
  </svg>
);

const XIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18"/>
    <line x1="6" y1="6" x2="18" y2="18"/>
  </svg>
);

const TrashIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6"/>
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
  </svg>
);

const ChevronIcon = ({ open }: { open: boolean }) => (
  <svg
    width="14" height="14" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
    style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.18s', flexShrink: 0 }}
  >
    <polyline points="6 9 12 15 18 9"/>
  </svg>
);

type BtnKind = 'good' | 'neutral' | 'bad';

function getBtnKind(index: number, total: number): BtnKind {
  if (total === 2) return index === 0 ? 'good' : 'bad';
  if (index === 0) return 'good';
  if (index === total - 1) return 'bad';
  return 'neutral';
}

function BtnIcon({ kind, total }: { kind: BtnKind; total: number }) {
  if (total === 2) return kind === 'good' ? <CheckIcon /> : <XIcon />;
  if (kind === 'good') return <SmileIcon />;
  if (kind === 'neutral') return <MehIcon />;
  return <FrownIcon />;
}

function FeedbackScreen({
  appState,
  questions,
  activeFeedbackAnswers,
  weeklyComment,
  feedbackState,
  onAnswerChange,
  onCommentChange,
  onPhotoNoteChange,
  onWeekChange,
  onClearFeedback
}: FeedbackScreenProps) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const activeWeekIndex = appState.activeWeekIndex;
  const activeWeekLabel = appState.weeks[activeWeekIndex]?.label ?? '';

  const toggle = (idx: number) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  return (
    <div className="screen" key="feedback">

      <div className="workout-selectors">
        <CustomSelect
          value={String(activeWeekIndex)}
          onChange={(val) => onWeekChange(Number(val))}
          options={appState.weeks.map((week) => ({
            value: String(week.index),
            label: week.label
          }))}
        />
      </div>

      <div className="feedback-actions-bar">
        <button type="button" className="action-btn action-btn--ghost" onClick={onClearFeedback}>
          <TrashIcon />
          Limpar semana
        </button>
      </div>

      <div className="card">
        <div className="feedback-list">
          {questions.map((question, questionIndex) => {
            const isOpen = expanded.has(questionIndex);
            const reversedOptions = [...question.options].reverse();

            const btns = reversedOptions.map((option, revIdx) => {
              const originalIdx = question.options.length - 1 - revIdx;
              const kind = getBtnKind(originalIdx, question.options.length);
              const isSelected = activeFeedbackAnswers[questionIndex] === option;
              return (
                <button
                  key={option}
                  type="button"
                  title={option}
                  className={`feedback-opt-btn feedback-opt-btn--${kind}${isSelected ? ' feedback-opt-btn--sel' : ''}`}
                  onClick={() => onAnswerChange(questionIndex, option)}
                >
                  <BtnIcon kind={kind} total={question.options.length} />
                </button>
              );
            });

            return (
              <div key={question.rowNumber} className={`feedback-card${isOpen ? ' feedback-card--open' : ''}`}>
                <div className="feedback-card__header" role="button" tabIndex={0}
                  onClick={() => toggle(questionIndex)}
                  onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && toggle(questionIndex)}>
                  <span className="feedback-card__label">
                    {isOpen && question.fullText ? question.fullText : question.text}
                  </span>
                  <ChevronIcon open={isOpen} />
                  {!isOpen && (
                    <div className="feedback-card__btns" onClick={(e) => e.stopPropagation()}>
                      {btns}
                    </div>
                  )}
                </div>
                {isOpen && (
                  <div className="feedback-card__footer">
                    {btns}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="card">
        <div className="feedback-field">
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
          <div className="feedback-field">
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
