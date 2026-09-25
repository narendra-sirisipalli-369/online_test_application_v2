import { useState } from 'react';
import { Check } from 'lucide-react';
import { Modal } from './Modal';
import type { Question } from '../types/app';

export type QuestionEditPayload = {
  questionText: string;
  answerType: 'OPTIONS' | 'TEXT';
  options: { key: string; content: string }[];
  correctOptionKey: string | null;
  correctTextAnswer: string | null;
};

type Props = {
  question: Question;
  onClose: () => void;
  onSave: (updates: QuestionEditPayload) => Promise<void>;
};

const OPTION_KEYS = ['A', 'B', 'C', 'D'];

export function QuestionEditModal({ question, onClose, onSave }: Props) {
  const [questionText, setQuestionText] = useState(question.questionText);
  const [answerType, setAnswerType] = useState<'OPTIONS' | 'TEXT'>(question.answerType);
  const [options, setOptions] = useState(
    question.options.length === 4
      ? question.options.map((option) => ({ key: option.key, content: option.content }))
      : OPTION_KEYS.map((key) => ({ key, content: '' })),
  );
  const [correctOptionKey, setCorrectOptionKey] = useState(question.correctOptionKey || 'A');
  const [correctTextAnswer, setCorrectTextAnswer] = useState(question.correctTextAnswer || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSave() {
    setSaving(true);
    setError('');
    try {
      await onSave({
        questionText,
        answerType,
        options,
        correctOptionKey: answerType === 'OPTIONS' ? correctOptionKey : null,
        correctTextAnswer: answerType === 'TEXT' ? correctTextAnswer : null,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save question');
      setSaving(false);
    }
  }

  return (
    <Modal
      actions={(
        <>
          <button className="ghost-button" onClick={onClose} type="button">Cancel</button>
          <button className="primary-button" disabled={saving} onClick={() => void handleSave()} type="button">
            {saving ? 'Updating…' : 'Update'}
          </button>
        </>
      )}
      onClose={onClose}
      size="lg"
      title="Edit question"
    >
      {error ? <div className="error-banner" style={{ marginBottom: 12 }}>{error}</div> : null}

      <div className="stack">
        <label>
          <span>Question</span>
          <textarea onChange={(event) => setQuestionText(event.target.value)} rows={3} value={questionText} />
        </label>

        <label>
          <span>Answer type</span>
          <select onChange={(event) => setAnswerType(event.target.value as 'OPTIONS' | 'TEXT')} value={answerType}>
            <option value="OPTIONS">Multiple choice (A-D)</option>
            <option value="TEXT">Text / numeric entry (no options)</option>
          </select>
        </label>

        {answerType === 'OPTIONS' ? (
          <div className="stack">
            <span className="caption">Tap the circle beside the correct option.</span>
            {options.map((option, index) => (
              <div className="question-edit-form__option-row" key={option.key}>
                <button
                  aria-label={`Mark option ${option.key} as correct`}
                  className={`correct-marker ${correctOptionKey === option.key ? 'correct-marker--active' : ''}`}
                  onClick={() => setCorrectOptionKey(option.key)}
                  type="button"
                >
                  {correctOptionKey === option.key ? <Check size={12} /> : null}
                </button>
                <span className="option-row__key">{option.key}</span>
                <input
                  onChange={(event) => {
                    const next = [...options];
                    next[index] = { ...option, content: event.target.value };
                    setOptions(next);
                  }}
                  value={option.content}
                />
              </div>
            ))}
          </div>
        ) : (
          <label>
            <span>Correct answer (exact text/number)</span>
            <input onChange={(event) => setCorrectTextAnswer(event.target.value)} value={correctTextAnswer} />
          </label>
        )}
      </div>
    </Modal>
  );
}
