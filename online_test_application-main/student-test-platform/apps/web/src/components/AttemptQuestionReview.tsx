import { CheckCircle2, CircleMinus, XCircle } from 'lucide-react';
import type { StudentHistoryQuestion } from '../types/app';
import { parseStructuredText, resolveAssetUrl } from '../utils/contentBlocks';
import { ContentBlockList } from './ContentBlockList';
import { LatexText } from './LatexText';

function AnswerResult({ result }: { result: StudentHistoryQuestion['result'] }) {
  if (result === 'CORRECT') return <span className="history-answer-result history-answer-result--correct"><CheckCircle2 size={14} /> Correct</span>;
  if (result === 'WRONG') return <span className="history-answer-result history-answer-result--wrong"><XCircle size={14} /> Incorrect</span>;
  return <span className="history-answer-result history-answer-result--empty"><CircleMinus size={14} /> Not answered</span>;
}

export function AttemptQuestionReview({ question }: { question: StudentHistoryQuestion }) {
  return (
    <article className="history-question-card">
      <div className="history-question-card__header">
        <span>Question {question.questionNumber}</span>
        <AnswerResult result={question.result} />
      </div>
      {question.topic ? <small className="history-question-card__topic">{question.topic}</small> : null}
      {question.paragraph ? (
        <div className="history-question-card__passage">
          <strong>Passage</strong>
          <div className="history-question-card__structured-content">
            <ContentBlockList blocks={parseStructuredText(question.paragraph)} />
          </div>
        </div>
      ) : null}
      {question.imagePath ? <img alt="Question reference" className="history-question-card__image" src={resolveAssetUrl(question.imagePath)} /> : null}
      <div className="history-question-card__question-text">
        <ContentBlockList blocks={parseStructuredText(question.questionText)} />
      </div>

      {question.answerType === 'OPTIONS' ? (
        <div className="history-question-options">
          {question.options.map((option) => {
            const isCorrect = option.key === question.correctAnswer;
            const isStudentAnswer = option.key === question.studentAnswer;
            return (
              <div className={`history-question-option ${isCorrect ? 'history-question-option--correct' : ''} ${isStudentAnswer ? 'history-question-option--student' : ''}`} key={option.key}>
                <span className="history-question-option__key">{option.key}</span>
                <span><LatexText text={option.content} /></span>
                <span className="history-question-option__labels">
                  {isCorrect ? <small>Correct answer</small> : null}
                  {isStudentAnswer ? <small>Student answer</small> : null}
                </span>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="history-text-answers">
          <div><span>Student answer</span><strong><LatexText text={question.studentAnswer || 'Not answered'} /></strong></div>
          <div><span>Correct answer</span><strong><LatexText text={question.correctAnswer || 'Not provided'} /></strong></div>
        </div>
      )}
    </article>
  );
}
