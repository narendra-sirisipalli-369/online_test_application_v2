import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { api } from '../../api/client';
import { Modal } from '../../components/Modal';
import { PageHeader } from '../../components/PageHeader';
import { ParagraphGroupCard } from '../../components/ParagraphGroupCard';
import { LatexText } from '../../components/LatexText';
import { useAuth } from '../../context/AuthContext';
import { normalizeText } from '../../utils/contentBlocks';
import type { QuestionOption, Test } from '../../types/app';

type QuestionStat = {
  questionId: string;
  questionNumber: string;
  questionText: string;
  paragraph?: string | null;
  imagePath?: string | null;
  questions: Array<{
    questionId: string;
    questionNumber: string;
    questionText: string;
    answerType: 'OPTIONS' | 'TEXT';
    options: QuestionOption[];
    correctAnswer: string | null;
  }>;
  selectedCount: number;
  correctCount: number;
  wrongCount: number;
};

type Analytics = {
  overview: { totalSessions: number; averageScore: number; averageRating: number | null; ratingCount: number };
  questionStats: QuestionStat[];
};

function truncate(text: string, max = 90) {
  const clean = normalizeText(text);
  return clean.length > max ? `${clean.slice(0, max)}…` : clean;
}

export function AdminAnalyticsPage() {
  const { token } = useAuth();
  const [tests, setTests] = useState<Test[]>([]);
  const [selectedTestId, setSelectedTestId] = useState('');
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [selectedQuestion, setSelectedQuestion] = useState<QuestionStat | null>(null);
  const [error, setError] = useState('');
  const [questionSearch, setQuestionSearch] = useState('');
  const [page, setPage] = useState(1);
  const filteredRows = (analytics?.questionStats || []).filter((row) =>
    `${row.questionNumber} ${normalizeText(row.questionText)}`.toLowerCase().includes(questionSearch.toLowerCase()));
  const pageSize = 12;
  const pageCount = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const visibleRows = filteredRows.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  useEffect(() => {
    if (!token) return;
    api.adminTests(token).then((response) => {
      setTests(response.tests);
      setSelectedTestId((current) => current || response.tests[0]?.id || '');
    }).catch((err) => {
      setError(err instanceof Error ? err.message : 'Unable to load tests');
    });
  }, [token]);

  useEffect(() => {
    if (!token || !selectedTestId) {
      setAnalytics(null);
      return;
    }
    const authToken = token;
    let cancelled = false;

    async function refresh() {
      try {
        const analyticsResponse = await api.analytics(authToken, selectedTestId);
        if (cancelled) return;
        setAnalytics(analyticsResponse as unknown as Analytics);
        setError('');
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Unable to load analytics');
      }
    }

    void refresh();
    const intervalId = window.setInterval(() => void refresh(), 3000 + Math.random() * 500);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [token, selectedTestId]);

  return (
    <div className="stack-lg analytics-page">
      <PageHeader
        description="Select a test and get a simple question-wise report with counts and quick question review."
        eyebrow="Admin workspace"
        title="Analytics"
      />

      {error ? <div className="error-banner">{error}</div> : null}

      <section className="card stack">
        <div className="toolbar">
          <select onChange={(event) => { setSelectedTestId(event.target.value); setPage(1); setQuestionSearch(''); }} value={selectedTestId}>
            <option value="">Choose test</option>
            {tests.map((test) => <option key={test.id} value={test.id}>{test.title}</option>)}
          </select>
        </div>
      </section>

      {analytics ? (
        <>
          <section className="stats-grid">
            <article className="stat-card">
              <span>total questions</span>
              <strong>{analytics.questionStats.length}</strong>
            </article>
            <article className="stat-card">
              <span>total sessions</span>
              <strong>{analytics.overview.totalSessions}</strong>
            </article>
            <article className="stat-card">
              <span>average score</span>
              <strong>{analytics.overview.averageScore.toFixed(1)}%</strong>
            </article>
            <article className="stat-card">
              <span>average rating</span>
              <strong>{analytics.overview.averageRating != null ? `${analytics.overview.averageRating.toFixed(1)} / 5` : '—'}</strong>
            </article>
          </section>

          <section className="card stack">
            <div className="admin-section-heading"><div><span className="eyebrow">Question performance</span><h2>Question report</h2><p>Review selection and answer outcomes for each question.</p></div><span className="admin-section-count">{filteredRows.length} questions</span></div>
            <label className="admin-search-field admin-search-field--report"><Search size={16} /><span className="sr-only">Search questions</span><input onChange={(event) => { setQuestionSearch(event.target.value); setPage(1); }} placeholder="Search by question number or text" value={questionSearch} /></label>
            {filteredRows.length ? (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Question No.</th>
                      <th>Question</th>
                      <th>Selected</th>
                      <th>Correct</th>
                      <th>Wrong</th>
                      <th>View</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleRows.map((row) => (
                      <tr key={row.questionId}>
                        <td>{row.questionNumber}</td>
                        <td className="data-table__truncate">{truncate(row.questionText)}</td>
                        <td>{row.selectedCount}</td>
                        <td>{row.correctCount}</td>
                        <td>{row.wrongCount}</td>
                        <td>
                          <button className="ghost-button" onClick={() => setSelectedQuestion(row)} type="button">
                            View
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p className="muted-text">{analytics.questionStats.length ? 'No questions match your search.' : 'No data yet.'}</p>}
            {pageCount > 1 ? <div className="admin-pagination"><span>Showing {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, filteredRows.length)} of {filteredRows.length}</span><div><button aria-label="Previous page" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)} type="button"><ChevronLeft size={16} /></button><span>Page {currentPage} of {pageCount}</span><button aria-label="Next page" disabled={currentPage === pageCount} onClick={() => setPage(currentPage + 1)} type="button"><ChevronRight size={16} /></button></div></div> : null}
          </section>
        </>
      ) : null}

      {selectedQuestion ? (
        <Modal
          key={`analytics-detail-${selectedQuestion.questionId}`}
          actions={<button className="ghost-button" onClick={() => setSelectedQuestion(null)} type="button">Close</button>}
          onClose={() => setSelectedQuestion(null)}
          size="lg"
          title={`Question ${selectedQuestion.questionNumber}`}
        >
          <div className="stack">
            {selectedQuestion.paragraph || selectedQuestion.imagePath ? (
              <article className="card stack" style={{ padding: 20 }}>
                <div className="eyebrow">Shared passage</div>
                <ParagraphGroupCard bare imagePath={selectedQuestion.imagePath} paragraph={selectedQuestion.paragraph} />
              </article>
            ) : null}
            {selectedQuestion.questions.map((question) => (
              <article className="card stack" key={question.questionId} style={{ padding: 20 }}>
                <strong>{question.questionNumber}. <LatexText text={question.questionText} /></strong>
                {question.answerType === 'OPTIONS' ? (
                  <div className="stack" style={{ gap: 10 }}>
                    {question.options.map((option) => (
                      <div className="option-row option-row--preview" key={option.key}>
                        <span className="option-row__key">{option.key}</span>
                        <span className="option-row__text"><LatexText text={option.content} /></span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="muted-text">Text answer question</p>
                )}
                <div className="success-banner">
                  Correct answer: {question.correctAnswer || '—'}
                </div>
              </article>
            ))}
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
