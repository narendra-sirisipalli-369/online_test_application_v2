import { useEffect, useState } from 'react';
import { ArrowRight, Radio, Users } from 'lucide-react';
import { api } from '../../api/client';
import { LiveRoomOverlay } from '../../components/LiveRoomOverlay';
import { Modal } from '../../components/Modal';
import { PageHeader } from '../../components/PageHeader';
import { ParagraphGroupCard } from '../../components/ParagraphGroupCard';
import { LatexText } from '../../components/LatexText';
import { useAuth } from '../../context/AuthContext';
import type { LobbyState, Test } from '../../types/app';

type LeaderboardRow = {
  studentId: string;
  studentName: string;
  scorePercent: number;
  correctCount: number;
  wrongCount: number;
  totalAnswerTimeSec: number;
};

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
    options: Array<{ key: string; content: string }>;
    correctAnswer: string | null;
  }>;
  selectedCount: number;
  selectedStudentNames: string[];
  correctCount: number;
  correctStudentNames: string[];
  wrongCount: number;
  wrongStudentNames: string[];
};

type Analytics = {
  leaderboard: LeaderboardRow[];
  questionStats: QuestionStat[];
};

export function AdminRoomPage() {
  const { token } = useAuth();
  const [tests, setTests] = useState<Test[]>([]);
  const [selectedTestId, setSelectedTestId] = useState('');
  const [entered, setEntered] = useState(false);
  const [lobby, setLobby] = useState<LobbyState | null>(null);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardRow[]>([]);
  const [unlocking, setUnlocking] = useState(false);
  const [ending, setEnding] = useState(false);
  const [viewOpen, setViewOpen] = useState(false);
  const [viewLoading, setViewLoading] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<QuestionStat | null>(null);
  const [error, setError] = useState('');

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
    if (!token || !selectedTestId || !entered) return;
    const authToken = token;
    let cancelled = false;

    async function refresh() {
      try {
        const [lobbyResponse, analyticsResponse] = await loadRoomState(authToken, selectedTestId);
        if (cancelled) return;
        setLobby(lobbyResponse);
        applyAnalytics(analyticsResponse);
        setError('');
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Unable to load the room');
      }
    }

    void refresh();
    const intervalId = window.setInterval(() => void refresh(), 2500 + Math.random() * 500);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [token, selectedTestId, entered]);

  function applyAnalytics(analyticsResponse: Analytics) {
    setAnalytics(analyticsResponse);
    setLeaderboard(analyticsResponse.leaderboard);
  }

  async function loadRoomState(authToken: string, testId: string) {
    const [lobbyResponse, analyticsResponse] = await Promise.all([
      api.adminLobby(authToken, testId),
      api.analytics(authToken, testId),
    ]);

    return [lobbyResponse, analyticsResponse as unknown as Analytics] as const;
  }

  async function refreshTests(authToken: string) {
    const refreshedTests = await api.adminTests(authToken);
    setTests(refreshedTests.tests);
    setSelectedTestId((current) => (
      refreshedTests.tests.some((test) => test.id === current)
        ? current
        : refreshedTests.tests[0]?.id || ''
    ));
  }

  async function openResults() {
    if (!token || !selectedTestId) return;
    setViewLoading(true);
    setError('');
    setSelectedGroup(null);
    try {
      const [, analyticsResponse] = await loadRoomState(token, selectedTestId);
      applyAnalytics(analyticsResponse);
      setViewOpen(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load results');
    } finally {
      setViewLoading(false);
    }
  }

  async function handleUnlock() {
    if (!token || !selectedTestId) return;
    setUnlocking(true);
    setError('');
    try {
      const response = await api.unlockTest(token, selectedTestId);
      setLobby(response);
      const [, analyticsResponse] = await loadRoomState(token, selectedTestId);
      applyAnalytics(analyticsResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to unlock this test');
    } finally {
      setUnlocking(false);
    }
  }

  async function handleEndTest() {
    if (!token || !selectedTestId) return;
    setEnding(true);
    setError('');
    setSelectedGroup(null);
    try {
      await api.endTest(token, selectedTestId);
      await refreshTests(token);
      const [lobbyResponse, analyticsResponse] = await loadRoomState(token, selectedTestId);
      setLobby(lobbyResponse);
      applyAnalytics(analyticsResponse);
      setViewOpen(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to end this test');
    } finally {
      setEnding(false);
    }
  }

  const selectedTest = tests.find((test) => test.id === selectedTestId) || null;

  if (entered) {
    return (
      <>
        <LiveRoomOverlay
          ending={ending}
          leaderboard={leaderboard}
          lobby={lobby}
          onClose={() => setEntered(false)}
          onEndTest={() => void handleEndTest()}
          onUnlock={() => void handleUnlock()}
          onViewResults={() => void openResults()}
          testTitle={selectedTest?.title || ''}
          unlocking={unlocking}
        />
        {viewOpen ? (
          <Modal
            key={selectedGroup ? `room-detail-${selectedGroup.questionId}` : `room-results-${selectedTestId}`}
            actions={selectedGroup ? (
              <>
                <button className="ghost-button" onClick={() => setSelectedGroup(null)} type="button">Back</button>
                <button className="ghost-button" onClick={() => { setSelectedGroup(null); setViewOpen(false); }} type="button">Close</button>
              </>
            ) : (
              <button className="ghost-button" onClick={() => setViewOpen(false)} type="button">Close</button>
            )}
            onClose={() => {
              setSelectedGroup(null);
              setViewOpen(false);
            }}
            size="lg"
            title={selectedGroup
              ? `Question ${selectedGroup.questionNumber}`
              : `Results${selectedTest ? ` — ${selectedTest.title}` : ''}`}
            tone="space"
          >
            {viewLoading ? (
              <p className="muted-text">Loading results…</p>
            ) : selectedGroup ? (
              <div className="stack">
                {selectedGroup.paragraph || selectedGroup.imagePath ? (
                  <article className="card stack" style={{ padding: 20 }}>
                    <div className="eyebrow">Shared passage</div>
                    <ParagraphGroupCard bare imagePath={selectedGroup.imagePath} paragraph={selectedGroup.paragraph} />
                  </article>
                ) : null}
                {selectedGroup.questions.map((question) => (
                  <article className="card stack" key={question.questionId}>
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
                    <div className="success-banner">Correct answer: {question.correctAnswer || '—'}</div>
                  </article>
                ))}
              </div>
            ) : analytics?.questionStats?.length ? (
              <div className="table-wrap">
                <table className="data-table data-table--room">
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
                    {analytics.questionStats.map((row) => (
                      <tr key={row.questionId}>
                        <td>{row.questionNumber}</td>
                        <td className="data-table__truncate">{row.questionText}</td>
                        <td>{row.selectedCount}</td>
                        <td>{row.correctCount}</td>
                        <td>{row.wrongCount}</td>
                        <td>
                          <button className="ghost-button" onClick={() => setSelectedGroup(row)} type="button">
                            View
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="muted-text">No results yet.</p>
            )}
          </Modal>
        ) : null}
      </>
    );
  }

  return (
    <div className="stack-lg">
      <PageHeader
        description="Open a full-screen live space for a test — students float in while they wait, then watch results roll in live once you unlock."
        eyebrow="Admin workspace"
        title="Room"
      />

      {error ? <div className="error-banner">{error}</div> : null}

      <div className="admin-detail-layout">
        <section className="card stack admin-room-entry">
          <span className="admin-room-entry__icon"><Radio size={23} /></span>
          <div><span className="eyebrow">Live monitoring</span><h2>Enter a test room</h2><p className="muted-text">See students in the waiting room, start the session together, and follow their results.</p></div>
          <label><span>Select a test</span><select onChange={(event) => setSelectedTestId(event.target.value)} value={selectedTestId}>
            <option value="">Choose test</option>
            {tests.map((test) => <option key={test.id} value={test.id}>{test.title}</option>)}
          </select></label>
          <button className="primary-button" disabled={!selectedTestId} onClick={() => setEntered(true)} type="button">Enter room <ArrowRight size={16} /></button>
        </section>
        <aside className="card admin-detail-aside"><Users size={22} /><h3>Before you begin</h3><p>Students can join the waiting room before you unlock the test. Select a test to open its live room.</p></aside>
      </div>
    </div>
  );
}
