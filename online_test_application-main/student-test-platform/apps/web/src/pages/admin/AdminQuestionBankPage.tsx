import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Pencil } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../../api/client';
import { Badge } from '../../components/Badge';
import { PageHeader } from '../../components/PageHeader';
import { Pagination } from '../../components/Pagination';
import { ParagraphGroupCard } from '../../components/ParagraphGroupCard';
import { PassageEditModal } from '../../components/PassageEditModal';
import { QuestionCard } from '../../components/QuestionCard';
import { QuestionEditModal, type QuestionEditPayload } from '../../components/QuestionEditModal';
import { useAuth } from '../../context/AuthContext';
import { groupQuestionsByParagraph } from '../../utils/questionGroups';
import type { Question } from '../../types/app';

const STATUS_FILTERS = ['ALL', 'PENDING', 'CORRECT', 'NEEDS_EDIT', 'INVALID', 'APPROVED'] as const;

export function AdminQuestionBankPage() {
  const { bankId = '' } = useParams();
  const { token } = useAuth();
  const [bankName, setBankName] = useState('');
  const [questions, setQuestions] = useState<Question[]>([]);
  const [editingPassageKey, setEditingPassageKey] = useState<string | null>(null);
  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<typeof STATUS_FILTERS[number]>('ALL');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [page, setPage] = useState(1);

  async function load() {
    if (!token || !bankId) return;
    try {
      const response = await api.adminBankQuestions(token, bankId);
      setBankName(response.bank.name);
      setQuestions(response.questions);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load this question bank');
    }
  }

  useEffect(() => {
    void load();
  }, [token, bankId]);

  async function persistQuestion(question: Question, patch: Partial<Question>) {
    if (!token) return;
    const merged = { ...question, ...patch };
    await api.updateQuestion(token, question.id, {
      paragraph: merged.paragraph,
      questionText: merged.questionText,
      textBeforeImage: merged.textBeforeImage || merged.questionText,
      textAfterImage: merged.textAfterImage || '',
      imagePath: merged.imagePath || '',
      topic: merged.topic || '',
      answerType: merged.answerType,
      correctOptionKey: merged.correctOptionKey,
      correctTextAnswer: merged.correctTextAnswer,
      verificationStatus: merged.verificationStatus,
      finalApproved: merged.finalApproved,
      options: merged.options,
      contentBlocks: merged.contentBlocks,
    });
  }

  async function quickSetAnswer(question: Question, value: string) {
    setError('');
    try {
      await persistQuestion(question, question.answerType === 'TEXT' ? { correctTextAnswer: value } : { correctOptionKey: value });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save answer');
    }
  }

  async function toggleGroupApproval(groupQuestions: Question[]) {
    setError('');
    const approved = !groupQuestions.every((question) => question.finalApproved);
    try {
      await Promise.all(groupQuestions.map((question) => persistQuestion(question, {
        finalApproved: approved,
        verificationStatus: approved ? 'APPROVED' : 'NEEDS_EDIT',
      })));
      setMessage(approved ? 'Approved' : 'Rejected');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update approval');
    }
  }

  async function savePassage(groupQuestions: Question[], paragraph: string) {
    await Promise.all(groupQuestions.map((question) => persistQuestion(question, { paragraph })));
    setEditingPassageKey(null);
    setMessage('Passage updated');
    await load();
  }

  async function saveQuestionEdit(question: Question, payload: QuestionEditPayload) {
    await persistQuestion(question, {
      questionText: payload.questionText,
      textBeforeImage: payload.questionText,
      answerType: payload.answerType,
      options: payload.answerType === 'OPTIONS' ? payload.options : [],
      correctOptionKey: payload.correctOptionKey,
      correctTextAnswer: payload.correctTextAnswer,
    });
    setEditingQuestionId(null);
    setMessage('Question updated');
    await load();
  }

  const filtered = questions.filter((question) => {
    if (statusFilter !== 'ALL' && question.verificationStatus !== statusFilter) return false;
    if (!search.trim()) return true;
    const haystack = `${question.questionText} ${question.topic || ''}`.toLowerCase();
    return haystack.includes(search.toLowerCase());
  });

  // Grouped for display against the filtered/searched subset, but group
  // actions (approve/reject, edit passage) must always target every sibling
  // question that actually shares the passage — not just whichever ones the
  // current search happens to show — so those resolve against the full set.
  const allGroups = useMemo(() => groupQuestionsByParagraph(questions), [questions]);
  const groups = useMemo(() => groupQuestionsByParagraph(filtered), [filtered]);
  const pageSize = 4;
  const pageCount = Math.max(1, Math.ceil(groups.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const visibleGroups = groups.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const editingQuestion = questions.find((question) => question.id === editingQuestionId) || null;
  const editingPassageGroup = allGroups.find((group) => group.key === editingPassageKey) || null;

  function resolveFullGroupQuestions(groupKey: string, fallback: Question[]) {
    return allGroups.find((group) => group.key === groupKey)?.questions ?? fallback;
  }

  return (
    <div className="stack-lg">
      <PageHeader
        actions={<Link className="ghost-button" to="/admin/questions"><ArrowLeft size={16} /> Back to banks</Link>}
        description="Review this bank's questions, set answers, and approve them for use in tests."
        eyebrow="Admin workspace"
        title={bankName || 'Question bank'}
      />

      {message ? <div className="success-banner">{message}</div> : null}
      {error ? <div className="error-banner">{error}</div> : null}

      <section className="card stack">
        <div className="toolbar">
          <input onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Search by text or topic" value={search} />
          <select onChange={(event) => { setStatusFilter(event.target.value as typeof statusFilter); setPage(1); }} value={statusFilter}>
            {STATUS_FILTERS.map((status) => <option key={status} value={status}>{status === 'ALL' ? 'All statuses' : status}</option>)}
          </select>
          <span className="muted-text">{filtered.length} of {questions.length} questions</span>
        </div>
      </section>

      <Pagination
        currentPage={currentPage}
        itemLabel="question sets"
        onPageChange={setPage}
        pageSize={pageSize}
        totalItems={groups.length}
        totalPages={pageCount}
      />

      <div className="stack">
        {!groups.length ? <div className="empty-state card"><strong>No questions found</strong><p>Try another search or verification status.</p></div> : null}
        {visibleGroups.map((group) => {
          const isSharedGroup = group.questions.length > 1;
          const hasPassage = Boolean(group.paragraph || group.imagePath);
          const fullGroupQuestions = resolveFullGroupQuestions(group.key, group.questions);
          const allApproved = fullGroupQuestions.every((question) => question.finalApproved);

          return (
            <div className={isSharedGroup ? 'question-group question-group--boxed card' : 'question-group'} key={group.key}>
              {hasPassage ? (
                <div className="question-group__passage-wrap">
                  <ParagraphGroupCard bare={isSharedGroup} imagePath={group.imagePath} paragraph={group.paragraph} />
                  <button className="ghost-button" onClick={() => setEditingPassageKey(group.key)} type="button">
                    <Pencil size={14} /> Edit passage
                  </button>
                </div>
              ) : null}

              {isSharedGroup ? (
                <div className="toolbar" style={{ marginBottom: 16, marginTop: hasPassage ? 16 : 0 }}>
                  <div className="toolbar">
                    <Badge value={allApproved ? 'APPROVED' : 'PENDING'} />
                    <span className="muted-text">
                      {group.questions.length === fullGroupQuestions.length
                        ? `${fullGroupQuestions.length} questions in this set`
                        : `${group.questions.length} of ${fullGroupQuestions.length} questions in this set shown`}
                    </span>
                  </div>
                  <button
                    className={`approve-toggle ${allApproved ? 'approve-toggle--approved' : ''}`}
                    onClick={() => void toggleGroupApproval(fullGroupQuestions)}
                    type="button"
                  >
                    {allApproved ? 'Reject' : 'Approve'}
                  </button>
                </div>
              ) : null}

              <div className={isSharedGroup ? 'question-group__items' : ''}>
                {group.questions.map((question) => (
                  <div className={isSharedGroup ? 'question-review-card question-review-card--nested' : 'question-review-card'} key={question.id}>
                    <div className={isSharedGroup ? 'review-actions review-actions--compact' : 'review-actions'}>
                      {isSharedGroup ? null : <Badge value={question.finalApproved ? 'APPROVED' : question.verificationStatus} />}
                      <button
                        aria-label="Edit question"
                        className="icon-button-plain"
                        onClick={() => setEditingQuestionId(question.id)}
                        title="Edit question"
                        type="button"
                      >
                        <Pencil size={15} />
                      </button>
                    </div>

                    <QuestionCard
                      answer={question.answerType === 'TEXT' ? question.correctTextAnswer : question.correctOptionKey}
                      bare={isSharedGroup}
                      hideSharedContent={hasPassage}
                      interactive
                      onAnswer={(value) => void quickSetAnswer(question, value)}
                      question={question}
                    />

                    {!isSharedGroup ? (
                      <div className="toolbar">
                        <span />
                        <button
                          className={`approve-toggle ${question.finalApproved ? 'approve-toggle--approved' : ''}`}
                          onClick={() => void toggleGroupApproval([question])}
                          type="button"
                        >
                          {question.finalApproved ? 'Reject' : 'Approve'}
                        </button>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <Pagination
        currentPage={currentPage}
        itemLabel="question sets"
        onPageChange={setPage}
        pageSize={pageSize}
        totalItems={groups.length}
        totalPages={pageCount}
      />

      {editingPassageGroup ? (
        <PassageEditModal
          initialParagraph={editingPassageGroup.paragraph || ''}
          onClose={() => setEditingPassageKey(null)}
          onSave={(paragraph) => savePassage(editingPassageGroup.questions, paragraph)}
        />
      ) : null}

      {editingQuestion ? (
        <QuestionEditModal
          onClose={() => setEditingQuestionId(null)}
          onSave={(payload) => saveQuestionEdit(editingQuestion, payload)}
          question={editingQuestion}
        />
      ) : null}
    </div>
  );
}
