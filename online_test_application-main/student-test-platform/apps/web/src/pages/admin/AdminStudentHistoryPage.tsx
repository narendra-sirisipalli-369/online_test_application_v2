import { useEffect, useState } from 'react';
import { ArrowLeft, CalendarDays, ChevronDown, ChevronUp, Clock3, Star, UserRound } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../../api/client';
import { Badge } from '../../components/Badge';
import { AttemptQuestionReview } from '../../components/AttemptQuestionReview';
import { PageHeader } from '../../components/PageHeader';
import { Pagination } from '../../components/Pagination';
import { useAuth } from '../../context/AuthContext';
import type { StudentHistoryEntry, StudentHistoryQuestion, StudentSummary } from '../../types/app';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:4100';

type HistorySummary = {
  totalSessions: number;
  completedSessions: number;
  averageScore: number | null;
  ratedSessions: number;
};

function formatDuration(seconds: number) {
  if (!seconds) return '—';
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

function HistoryRating({ rating }: { rating?: number | null }) {
  if (!rating) return <span className="muted-text">Not rated</span>;
  return (
    <span aria-label={`${rating} out of 5 stars`} className="student-history-rating">
      <Star fill="currentColor" size={14} /> {rating}/5
    </span>
  );
}

export function AdminStudentHistoryPage() {
  const { studentId = '' } = useParams();
  const { token } = useAuth();
  const [student, setStudent] = useState<Omit<StudentSummary, 'sessionCount'> | null>(null);
  const [summary, setSummary] = useState<HistorySummary | null>(null);
  const [history, setHistory] = useState<StudentHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedSessionId, setExpandedSessionId] = useState<string | null>(null);
  const [questionDetails, setQuestionDetails] = useState<Record<string, StudentHistoryQuestion[]>>({});
  const [questionPages, setQuestionPages] = useState<Record<string, number>>({});
  const [detailsLoadingId, setDetailsLoadingId] = useState<string | null>(null);
  const [detailsError, setDetailsError] = useState('');

  useEffect(() => {
    if (!token) return;
    api.adminStudentHistory(token, studentId)
      .then((response) => {
        setStudent(response.student);
        setSummary(response.summary);
        setHistory(response.history);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Unable to load student history'))
      .finally(() => setLoading(false));
  }, [studentId, token]);

  async function toggleQuestionDetails(sessionId: string) {
    if (expandedSessionId === sessionId) {
      setExpandedSessionId(null);
      return;
    }

    setExpandedSessionId(sessionId);
    setDetailsError('');
    setQuestionPages((pages) => ({ ...pages, [sessionId]: pages[sessionId] || 1 }));
    if (!token || questionDetails[sessionId]) return;

    setDetailsLoadingId(sessionId);
    try {
      const response = await api.adminStudentHistoryQuestions(token, studentId, sessionId);
      setQuestionDetails((details) => ({ ...details, [sessionId]: response.questions }));
    } catch (err) {
      setDetailsError(err instanceof Error ? err.message : 'Unable to load question and answer details');
    } finally {
      setDetailsLoadingId(null);
    }
  }

  if (loading) return <div className="page-loader">Loading student history…</div>;

  if (error || !student || !summary) {
    return (
      <div className="stack">
        <div className="error-banner">{error || 'Student not found'}</div>
        <Link className="ghost-button student-history-back" to="/admin/students"><ArrowLeft size={15} /> Back to students</Link>
      </div>
    );
  }

  return (
    <div className="stack-lg student-history-page">
      <PageHeader
        actions={<Link className="ghost-button" to="/admin/students"><ArrowLeft size={15} /> Back to students</Link>}
        description="Review this student's complete test activity and performance."
        eyebrow="Student directory"
        title="Student history"
      />

      <section className="card student-history-profile">
        {student.avatar ? (
          <img alt="" className="student-history-profile__avatar" src={`${API_BASE}${student.avatar.imageUrl}`} />
        ) : (
          <span className="student-history-profile__avatar student-history-profile__avatar--placeholder"><UserRound size={25} /></span>
        )}
        <div>
          <h2>{student.name}</h2>
          <p>{student.course || 'Course not provided'} · {student.mobileNumber || 'Mobile not provided'}</p>
          <small>Joined {new Date(student.createdAt).toLocaleDateString()}</small>
        </div>
        <Badge tone={student.isBlocked ? 'bad' : 'good'} value={student.isBlocked ? 'Blocked' : 'Active'} />
      </section>

      <section aria-label="Student history summary" className="student-history-summary">
        <article><span>Total sessions</span><strong>{summary.totalSessions}</strong></article>
        <article><span>Completed</span><strong>{summary.completedSessions}</strong></article>
        <article><span>Average score</span><strong>{summary.averageScore == null ? '—' : `${summary.averageScore.toFixed(1)}%`}</strong></article>
        <article><span>Ratings submitted</span><strong>{summary.ratedSessions}</strong></article>
      </section>

      <section className="stack">
        <div className="admin-section-heading">
          <div><span className="eyebrow">Activity</span><h2>Test attempts</h2><p>Newest activity appears first.</p></div>
          <span className="admin-section-count">{history.length} sessions</span>
        </div>

        {history.length ? (
          <div className="student-history-list">
            {history.map((entry) => {
              const questions = questionDetails[entry.id] || [];
              const questionPageSize = 5;
              const questionPageCount = Math.max(1, Math.ceil(questions.length / questionPageSize));
              const questionPage = Math.min(questionPages[entry.id] || 1, questionPageCount);
              const visibleQuestions = questions.slice((questionPage - 1) * questionPageSize, questionPage * questionPageSize);

              return (
              <article className={`card student-history-entry ${expandedSessionId === entry.id ? 'student-history-entry--expanded' : ''}`} key={entry.id}>
                <div className="student-history-entry__heading">
                  <div><span>{entry.test.mode === 'MOCK' ? 'Mock test' : 'Sectional test'}</span><h3>{entry.test.title}</h3></div>
                  <Badge value={entry.status} />
                </div>
                <div className="student-history-entry__stats">
                  <span><small>Score</small><strong>{entry.status === 'SUBMITTED' || entry.status === 'AUTO_SUBMITTED' ? `${entry.scorePercent.toFixed(1)}%` : '—'}</strong></span>
                  <span><small>Answered</small><strong>{entry.answeredCount} / {entry.selectedCount}</strong></span>
                  <span><small>Correct</small><strong>{entry.correctCount}</strong></span>
                  <span><small>Incorrect</small><strong>{entry.wrongCount}</strong></span>
                  <span><small>Time</small><strong>{formatDuration(entry.totalAnswerTimeSec)}</strong></span>
                  <span><small>Rating</small><strong><HistoryRating rating={entry.rating} /></strong></span>
                </div>
                <div className="student-history-entry__dates">
                  <span><CalendarDays size={13} /> Started {entry.startedAt ? new Date(entry.startedAt).toLocaleString() : '—'}</span>
                  <span><Clock3 size={13} /> Submitted {entry.submittedAt ? new Date(entry.submittedAt).toLocaleString() : '—'}</span>
                </div>
                {entry.review ? <blockquote>{entry.review}</blockquote> : null}
                <button
                  aria-expanded={expandedSessionId === entry.id}
                  className="ghost-button student-history-entry__details-button"
                  disabled={!entry.selectedCount}
                  onClick={() => void toggleQuestionDetails(entry.id)}
                  type="button"
                >
                  {expandedSessionId === entry.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  {entry.selectedCount ? (expandedSessionId === entry.id ? 'Hide questions and answers' : 'View questions and answers') : 'No questions selected'}
                </button>

                {expandedSessionId === entry.id ? (
                  <section aria-label={`Questions and answers for ${entry.test.title}`} className="student-history-answers">
                    <div className="student-history-answers__heading">
                      <div><span>Attempt details</span><h4>Questions and answers</h4></div>
                      {questions.length ? <strong>{questions.length} questions</strong> : null}
                    </div>
                    {detailsLoadingId === entry.id ? <div className="history-answers-status">Loading questions and answers…</div> : null}
                    {detailsError && detailsLoadingId !== entry.id && !questions.length ? <div className="error-banner">{detailsError}</div> : null}
                    {visibleQuestions.map((question) => <AttemptQuestionReview key={question.id} question={question} />)}
                    {!detailsLoadingId && !detailsError && !questions.length ? <div className="history-answers-status">No selected questions were recorded for this attempt.</div> : null}
                    <Pagination
                      currentPage={questionPage}
                      itemLabel="questions"
                      onPageChange={(nextPage) => setQuestionPages((pages) => ({ ...pages, [entry.id]: nextPage }))}
                      pageSize={questionPageSize}
                      totalItems={questions.length}
                      totalPages={questionPageCount}
                    />
                  </section>
                ) : null}
              </article>
              );
            })}
          </div>
        ) : (
          <div className="card admin-reviews-empty"><UserRound size={28} /><strong>No test history yet</strong><p>This student has not started a test.</p></div>
        )}
      </section>
    </div>
  );
}
