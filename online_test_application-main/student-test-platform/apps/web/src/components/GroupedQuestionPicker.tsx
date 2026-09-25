import { Badge } from './Badge';
import { ParagraphGroupCard } from './ParagraphGroupCard';
import { QuestionCard } from './QuestionCard';
import { groupQuestionsByParagraph } from '../utils/questionGroups';
import type { Question } from '../types/app';

type Props = {
  questions: Question[];
  selectedIds: string[];
  onToggleQuestion: (id: string) => void;
  onToggleGroup: (groupIds: string[], select: boolean) => void;
  onQuickAnswer: (question: Question, value: string) => void;
  onToggleApproval: (questions: Question[]) => void;
};

// A passage and the question(s) that share it are one unit here: checking
// the group covers all of them at once, so a multi-question passage is
// picked/approved as a single thing rather than N unrelated flat rows.
export function GroupedQuestionPicker({
  questions,
  selectedIds,
  onToggleQuestion,
  onToggleGroup,
  onQuickAnswer,
  onToggleApproval,
}: Props) {
  const groups = groupQuestionsByParagraph(questions);

  if (!groups.length) {
    return <p className="muted-text">No questions found.</p>;
  }

  return (
    <div className="stack">
      {groups.map((group) => {
        const isSharedGroup = group.questions.length > 1;
        const hasPassage = Boolean(group.paragraph || group.imagePath);
        const groupIds = group.questions.map((question) => question.id);
        const allSelected = groupIds.every((id) => selectedIds.includes(id));
        const allApproved = group.questions.every((question) => question.finalApproved);

        return (
          <div className={isSharedGroup ? 'question-group question-group--boxed card' : 'question-group'} key={group.key}>
            {hasPassage ? (
              <div className="question-group__passage-wrap">
                <ParagraphGroupCard bare={isSharedGroup} imagePath={group.imagePath} paragraph={group.paragraph} />
              </div>
            ) : null}

            {isSharedGroup ? (
              <div className="toolbar" style={{ marginBottom: 16, marginTop: hasPassage ? 16 : 0 }}>
                <label className="checkbox-row">
                  <input checked={allSelected} onChange={(event) => onToggleGroup(groupIds, event.target.checked)} type="checkbox" />
                  <span>Include all {group.questions.length} in this set</span>
                </label>
                <div className="toolbar">
                  <Badge value={allApproved ? 'APPROVED' : 'PENDING'} />
                  <button
                    className={`approve-toggle ${allApproved ? 'approve-toggle--approved' : ''}`}
                    onClick={() => onToggleApproval(group.questions)}
                    type="button"
                  >
                    {allApproved ? 'Reject' : 'Approve'}
                  </button>
                </div>
              </div>
            ) : null}

            <div className={isSharedGroup ? 'question-group__items' : ''}>
              {group.questions.map((question) => {
                const missingAnswer = question.answerType === 'TEXT' ? !question.correctTextAnswer?.trim() : !question.correctOptionKey;
                return (
                  <div className={isSharedGroup ? 'question-review-card question-review-card--nested' : 'question-review-card'} key={question.id}>
                    <div className={isSharedGroup ? 'review-actions review-actions--compact' : 'review-actions'}>
                      <label className="checkbox-row">
                        <input checked={selectedIds.includes(question.id)} onChange={() => onToggleQuestion(question.id)} type="checkbox" />
                        <span className="muted-text text-small">Include</span>
                      </label>
                      {isSharedGroup ? null : <Badge value={question.finalApproved ? 'APPROVED' : question.verificationStatus} />}
                      {missingAnswer ? <Badge tone="bad" value="NO ANSWER" /> : null}
                    </div>

                    <QuestionCard
                      answer={question.answerType === 'TEXT' ? question.correctTextAnswer : question.correctOptionKey}
                      bare={isSharedGroup}
                      hideSharedContent={hasPassage}
                      interactive
                      onAnswer={(value) => onQuickAnswer(question, value)}
                      question={question}
                    />

                    {!isSharedGroup ? (
                      <div className="toolbar">
                        <span />
                        <button
                          className={`approve-toggle ${question.finalApproved ? 'approve-toggle--approved' : ''}`}
                          onClick={() => onToggleApproval([question])}
                          type="button"
                        >
                          {question.finalApproved ? 'Reject' : 'Approve'}
                        </button>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
