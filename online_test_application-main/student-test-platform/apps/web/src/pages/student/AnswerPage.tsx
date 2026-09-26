import { useEffect, useState } from 'react';
import { CheckCircle2, TimerOff } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api/client';
import { ExamWorkspace } from '../../components/ExamWorkspace';
import { useAuth } from '../../context/AuthContext';
import { useActiveTestWarning } from '../../hooks/useActiveTestWarning';
import { useExpiryPoll } from '../../hooks/useExpiryPoll';
import { useSessionWatcher } from '../../hooks/useSessionWatcher';
import type { Question, TestSession } from '../../types/app';

function useCountdown(targetIso?: string | null) {
  const [remaining, setRemaining] = useState(0);
  useEffect(() => {
    if (!targetIso) return;
    const tick = () => setRemaining(Math.max(0, Math.floor((new Date(targetIso).getTime() - Date.now()) / 1000)));
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [targetIso]);
  return remaining;
}

function mockSectionDeadline(session: TestSession | null) {
  const structure = session?.test.mockStructure;
  if (!session?.answerStartedAt || !structure?.sectionTimed) return null;
  const startedAt = new Date(session.answerStartedAt).getTime();
  const elapsed = Date.now() - startedAt;
  let boundary = 0;
  for (const section of structure.sections) {
    boundary += section.minutes * 60 * 1000;
    if (elapsed < boundary) return new Date(startedAt + boundary).toISOString();
  }
  return null;
}

export function AnswerPage() {
  const { sessionId = '' } = useParams();
  const { token, user } = useAuth();
  const navigate = useNavigate();
  const [session, setSession] = useState<TestSession | null>(null);
  const [questions, setQuestions] = useState<Array<Question & { answer: string | null }>>([]);
  const [error, setError] = useState('');
  const [completion, setCompletion] = useState<{ autoSubmitted: boolean } | null>(null);
  const remaining = useCountdown(session?.answerEndsAt);
  const sectionDeadline = mockSectionDeadline(session);
  const sectionRemaining = useCountdown(sectionDeadline);
  const { dismissTabWarning, showTabWarning, warningMessage } = useActiveTestWarning(session?.status === 'ANSWERING' && !completion);

  async function load() {
    if (!token) return;
    const [sessionResponse, questionResponse] = await Promise.all([
      api.getSession(token, sessionId),
      api.getAnswerQuestions(token, sessionId),
    ]);
    setSession(sessionResponse.session);
    setQuestions(questionResponse.questions);
  }

  useEffect(() => {
    void load().catch((err) => setError(err instanceof Error ? err.message : 'Unable to load the test'));
  }, [sessionId, token]);

  useEffect(() => {
    if (sectionDeadline && sectionRemaining === 0) {
      void load().catch((err) => setError(err instanceof Error ? err.message : 'Unable to open the next section'));
    }
  }, [sectionDeadline, sectionRemaining]);

  useExpiryPoll({
    deadlineIso: session?.answerEndsAt,
    enabled: session?.status === 'ANSWERING',
    remaining,
    onCheck: async () => {
      if (!token) return 'resolved';
      const response = await api.getSession(token, sessionId);
      setSession(response.session);
      if (response.session.status === 'SUBMITTED' || response.session.status === 'AUTO_SUBMITTED') {
        setCompletion({ autoSubmitted: response.session.status === 'AUTO_SUBMITTED' });
        return 'resolved';
      }
      return 'pending';
    },
  });

  useSessionWatcher({
    enabled: session?.status === 'ANSWERING' && !completion,
    onCheck: async () => {
      if (!token) return;
      const response = await api.getSession(token, sessionId);
      setSession(response.session);
      if (response.session.status === 'SUBMITTED' || response.session.status === 'AUTO_SUBMITTED') {
        setCompletion({ autoSubmitted: response.session.status === 'AUTO_SUBMITTED' });
      }
    },
  });

  async function saveAnswer(questionId: string, value: string) {
    if (!token) return;
    setError('');
    setQuestions((current) => current.map((question) => question.id === questionId ? { ...question, answer: value } : question));
    try {
      await api.saveAnswer(token, sessionId, { questionId, selectedOptionKey: value });
      const response = await api.getSession(token, sessionId);
      setSession(response.session);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save this answer');
      await load();
    }
  }

  async function clearAnswer(questionId: string) {
    if (!token) return;
    setError('');
    setQuestions((current) => current.map((question) => question.id === questionId ? { ...question, answer: null } : question));
    try {
      await api.clearAnswer(token, sessionId, questionId);
      const response = await api.getSession(token, sessionId);
      setSession(response.session);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to clear this answer');
      await load();
    }
  }

  async function confirmSubmit() {
    if (!token) return;
    setError('');
    try {
      await api.submitSession(token, sessionId);
      const response = await api.getSession(token, sessionId);
      setSession(response.session);
      setCompletion({ autoSubmitted: false });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to submit this test');
    }
  }

  if (completion) {
    const answered = session?.totalAnsweredCount ?? questions.filter((question) => question.answer).length;
    return (
      <div className="test-shell" style={{ overflow: 'auto' }}>
        <main className="test-main test-main--single" style={{ maxWidth: 560 }}>
          <div className="card completion-screen">
            <div className={`completion-screen__icon ${completion.autoSubmitted ? 'completion-screen__icon--warning' : ''}`}>{completion.autoSubmitted ? <TimerOff size={28} /> : <CheckCircle2 size={28} />}</div>
            <h2>{completion.autoSubmitted ? 'Time is over' : 'Test submitted'}</h2>
            <p>{completion.autoSubmitted ? 'Your answers were submitted automatically.' : `Your answers for ${session?.test.title} were submitted successfully.`}</p>
            <div className="completion-screen__stats">
              <div className="stat-card"><span>Questions answered</span><strong>{answered} / {session?.totalSelectedCount ?? questions.length}</strong></div>
              <div className="stat-card"><span>Submission time</span><strong style={{ fontSize: 18 }}>{new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</strong></div>
            </div>
            <div className="completion-screen__actions">
              <button className="ghost-button" onClick={() => navigate('/student')} type="button">Back to tests</button>
              <button className="primary-button" onClick={() => navigate(`/student/sessions/${sessionId}/result`)} type="button">View result</button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (!session || !questions.length) {
    return <div className="page-loader">{error ? <div className="error-banner">{error}</div> : 'Loading test…'}</div>;
  }

  return (
    <ExamWorkspace
      error={error}
      key={`${session.id}-${questions[0]?.topic || 'section'}`}
      onAnswer={(questionId, value) => void saveAnswer(questionId, value)}
      onClearAnswer={(questionId) => void clearAnswer(questionId)}
      onDismissWarning={dismissTabWarning}
      onSubmit={() => void confirmSubmit()}
      questions={questions}
      remainingSeconds={remaining}
      sectionRemainingSeconds={sectionDeadline ? sectionRemaining : undefined}
      sectionTimed={Boolean(session.test.mockStructure?.sectionTimed)}
      session={session}
      showWarning={showTabWarning}
      user={user}
      warningMessage={warningMessage}
    />
  );
}
