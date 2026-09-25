import { useEffect, useMemo, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, Flag } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api/client';
import { ParagraphGroupCard } from '../../components/ParagraphGroupCard';
import { QuestionCard } from '../../components/QuestionCard';
import { TestTimer } from '../../components/TestTimer';
import { useAuth } from '../../context/AuthContext';
import { useActiveTestWarning } from '../../hooks/useActiveTestWarning';
import { useExpiryPoll } from '../../hooks/useExpiryPoll';
import { useQuestionPages } from '../../hooks/useQuestionPages';
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
  const { token } = useAuth();
  const navigate = useNavigate();
  const [session, setSession] = useState<TestSession | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
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
  const pages = useQuestionPages(groups);
  const selectedGroupCount = useMemo(
    () => groups.filter((group) => group.questions.some((question) => selectedIds.includes(question.id))).length,
    [groups, selectedIds],
  );

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

  const activePageIndex = Math.min(currentPageIndex, Math.max(0, pages.length - 1));
  const currentPage = pages[activePageIndex];
  const contextGroup = currentPage?.groups.length === 1 ? currentPage.groups[0] : null;
  const pageRawIndexes = currentPage ? currentPage.questions.map((question) => questions.findIndex((item) => item.id === question.id)) : [];
  const rangeLabel = pageRawIndexes.length > 1
    ? `Questions ${Math.min(...pageRawIndexes) + 1}-${Math.max(...pageRawIndexes) + 1} of ${questions.length}`
    : `Question ${(pageRawIndexes[0] ?? 0) + 1} of ${questions.length}`;
  const hasContext = Boolean(contextGroup?.paragraph || contextGroup?.imagePath);

  if (!session || !currentPage) {
    return <div className="page-loader">{error ? <div className="error-banner">{error}</div> : 'Loading test…'}</div>;
  }

  const contextQuestionIds = contextGroup?.questions.map((question) => question.id) || [];
  const contextSelected = contextQuestionIds.every((id) => selectedIds.includes(id));
  const isGrouped = Boolean(contextGroup && contextGroup.questions.length > 1);
  const isMultiQuestionPage = !hasContext && currentPage.questions.length > 1;

  const questionCards = currentPage.groups.flatMap((group) => group.questions.map((question, index) => {
    const groupQuestionIds = group.questions.map((item) => item.id);
    const groupedQuestion = group.questions.length > 1;
    return (
      <div className={hasContext ? (index > 0 ? 'test-question-box__item' : '') : 'card test-question-box question-page-card'} key={question.id}>
        <QuestionCard
          bare
          displayNumber={questions.findIndex((item) => item.id === question.id) + 1}
          hideSharedContent={hasContext}
          onToggleSelect={groupedQuestion ? undefined : () => void toggleGroup(groupQuestionIds)}
          previewOnly={groupedQuestion}
          question={question}
          selectable={!groupedQuestion}
          selected={selectedIds.includes(question.id)}
        />
        {isMultiQuestionPage ? (
          <button className={`question-page-flag ${flagged.has(question.id) ? 'question-page-flag--active' : ''}`} onClick={() => toggleFlag(question.id)} type="button">
            <Flag size={13} /> {flagged.has(question.id) ? 'Flagged' : 'Flag'}
          </button>
        ) : null}
      </div>
    );
  }));

  const selectGroupButton = isGrouped ? (
    <button className={`ghost-button ${contextSelected ? 'active' : ''}`} onClick={() => void toggleGroup(contextQuestionIds)} type="button">
      {contextSelected ? (
        <>
          <Check size={16} /> Selected
        </>
      ) : 'Select these questions'}
    </button>
  ) : null;

  return (
    <div className="test-shell">
      <header className="test-topbar">
        <div className="test-topbar__row">
          <div className="test-topbar__title">
            <span className="test-topbar__brand">Online Test Application</span>
            <span className="test-topbar__phase">{session.test.title}</span>
          </div>
          <TestTimer remainingSeconds={remaining} totalSeconds={session.test.readingDurationSec} />
        </div>
        <div className="test-topbar__subtitle">
          <span>Reading phase &middot; Question selection</span>
          <span className="selection-counter">{selectedGroupCount} / {session.test.thresholdCount} selected</span>
        </div>
      </header>

      {showTabWarning ? (
        <div className="warning-banner" style={{ margin: '0 32px', marginTop: 12 }}>
          <span>{warningMessage} Your reading time continued while you were away.</span>
          <button className="ghost-button" onClick={dismissTabWarning} type="button">Stay in test</button>
        </div>
      ) : null}

      {error ? <div className="error-banner" style={{ margin: '0 32px', marginTop: 12 }}>{error}</div> : null}

      <main className={`test-main ${hasContext ? 'test-main--split' : 'test-main--single'} ${isMultiQuestionPage ? 'test-main--multi' : ''}`}>
        {hasContext ? (
          <>
            <div className="test-split-pane">
              <ParagraphGroupCard imagePath={contextGroup?.imagePath} paragraph={contextGroup?.paragraph} />
              {selectGroupButton ? <div className="group-select-action">{selectGroupButton}</div> : null}
            </div>
            <div className="test-split-questions">
              <div className="card test-question-box">{questionCards}</div>
            </div>
          </>
        ) : (
          <div className="question-page-grid">{questionCards}</div>
        )}
      </main>

      <footer className="test-bottombar">
        <div className="test-bottombar__row">
          <button
            className="ghost-button"
            disabled={activePageIndex === 0}
            onClick={() => setCurrentPageIndex(Math.max(0, activePageIndex - 1))}
            type="button"
          >
            <ChevronLeft size={16} /> Previous
          </button>

          <div className="test-bottombar__center">
            <span>{rangeLabel}</span>
            {currentPage.questions.length === 1 ? (
              <button
                className={`flag-button ${flagged.has(currentPage.questions[0].id) ? 'flag-button--active' : ''}`}
                onClick={() => toggleFlag(currentPage.questions[0].id)}
                type="button"
              >
                <Flag size={14} /> Flag
              </button>
            ) : null}
          </div>

          <button
            className="ghost-button"
            disabled={activePageIndex === pages.length - 1}
            onClick={() => setCurrentPageIndex(Math.min(pages.length - 1, activePageIndex + 1))}
            type="button"
          >
            Next <ChevronRight size={16} />
          </button>
        </div>
      </footer>
    </div>
  );
}
