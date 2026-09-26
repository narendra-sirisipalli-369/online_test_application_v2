import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api/client';
import { SelectionWorkspace } from '../../components/SelectionWorkspace';
import { useAuth } from '../../context/AuthContext';
import { useActiveTestWarning } from '../../hooks/useActiveTestWarning';
import { useExpiryPoll } from '../../hooks/useExpiryPoll';
import { useSessionWatcher } from '../../hooks/useSessionWatcher';
import { groupQuestionsByParagraph } from '../../utils/questionGroups';
import type { Question, TestSession } from '../../types/app';

function useCountdown(targetIso?: string | null) {
  const [remaining, setRemaining] = useState(0);
  useEffect(() => {
    if (!targetIso) return;
    const tick = () => {
      setRemaining(Math.max(0, Math.floor((new Date(targetIso).getTime() - Date.now()) / 1000)));
    };
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [targetIso]);
  return remaining;
}

export function ReadingPage() {
  const { sessionId = '' } = useParams();
  const { token, user } = useAuth();
  const navigate = useNavigate();
  const [session, setSession] = useState<TestSession | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [flagged, setFlagged] = useState<Set<string>>(new Set());
  const [error, setError] = useState('');
  const remaining = useCountdown(session?.readingEndsAt);
  const { dismissTabWarning, showTabWarning, warningMessage } = useActiveTestWarning(session?.status === 'READING');

  useEffect(() => {
    if (!token) return;
    Promise.all([
      api.getSession(token, sessionId),
      api.getReadingQuestions(token, sessionId),
    ])
      .then(([sessionResponse, questionResponse]) => {
        if (sessionResponse.session.status === 'WAITING') {
          navigate(`/student/sessions/${sessionId}/lobby`, { replace: true });
          return;
        }
        if (sessionResponse.session.status === 'ANSWERING') {
          navigate(`/student/sessions/${sessionId}/answer`, { replace: true });
          return;
        }
        if (sessionResponse.session.status === 'SUBMITTED' || sessionResponse.session.status === 'AUTO_SUBMITTED') {
          navigate(`/student/sessions/${sessionId}/result`, { replace: true });
          return;
        }
        setSession(sessionResponse.session);
        setQuestions(questionResponse.questions);
        setSelectedIds(questionResponse.selectedQuestionIds);
      })
      .catch((err) => setError(err.message));
  }, [token, sessionId, navigate]);

  useExpiryPoll({
    deadlineIso: session?.readingEndsAt,
    enabled: session?.status === 'READING',
    remaining,
    onCheck: async () => {
      if (!token) return 'resolved';
      const response = await api.getSession(token, sessionId);
      setSession(response.session);
      if (response.session.status === 'ANSWERING') {
        navigate(`/student/sessions/${sessionId}/answer`);
        return 'resolved';
      }
      return 'pending';
    },
  });

  // Catches an admin ending the test early, independent of this student's
  // own countdown — see useSessionWatcher for why useExpiryPoll alone misses it.
  useSessionWatcher({
    enabled: session?.status === 'READING',
    onCheck: async () => {
      if (!token) return;
      const response = await api.getSession(token, sessionId);
      if (response.session.status === 'SUBMITTED' || response.session.status === 'AUTO_SUBMITTED') {
        navigate(`/student/sessions/${sessionId}/result`);
        return;
      }
      if (response.session.status === 'ANSWERING') {
        navigate(`/student/sessions/${sessionId}/answer`);
        return;
      }
      setSession(response.session);
    },
  });

  const groups = useMemo(() => groupQuestionsByParagraph(questions), [questions]);

  async function toggleGroup(groupQuestionIds: string[]) {
    if (!token || !session) return;
    const previous = selectedIds;
    const allSelected = groupQuestionIds.every((id) => previous.includes(id));
    const next = allSelected
      ? previous.filter((id) => !groupQuestionIds.includes(id))
      : Array.from(new Set([...previous, ...groupQuestionIds]));
    setSelectedIds(next);
    try {
      const response = await api.saveSelections(token, sessionId, next);
      setSession(response.session);
    } catch (err) {
      setSelectedIds(previous);
      setError(err instanceof Error ? err.message : 'Unable to save selection');
    }
  }

  function toggleFlag(questionId: string) {
    setFlagged((current) => {
      const next = new Set(current);
      if (next.has(questionId)) next.delete(questionId); else next.add(questionId);
      return next;
    });
  }

  if (!session || !groups.length) {
    return <div className="page-loader">{error ? <div className="error-banner">{error}</div> : 'Loading test…'}</div>;
  }

  return (
    <SelectionWorkspace
      error={error}
      flagged={flagged}
      groups={groups}
      onDismissWarning={dismissTabWarning}
      onToggleFlag={toggleFlag}
      onToggleGroup={(ids) => void toggleGroup(ids)}
      questions={questions}
      remainingSeconds={remaining}
      selectedIds={selectedIds}
      session={session}
      showWarning={showTabWarning}
      thresholdCount={session.test.thresholdCount}
      user={user}
      warningMessage={warningMessage}
    />
  );
}
