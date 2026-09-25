import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Flag,
  TimerOff,
} from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../../api/client";
import { Modal } from "../../components/Modal";
import { ParagraphGroupCard } from "../../components/ParagraphGroupCard";
import { QuestionCard } from "../../components/QuestionCard";
import { TestTimer } from "../../components/TestTimer";
import { useAuth } from "../../context/AuthContext";
import { useActiveTestWarning } from "../../hooks/useActiveTestWarning";
import { useExpiryPoll } from "../../hooks/useExpiryPoll";
import { useQuestionPages } from "../../hooks/useQuestionPages";
import { useSessionWatcher } from "../../hooks/useSessionWatcher";
import { groupQuestionsByParagraph } from "../../utils/questionGroups";
import type { Question, TestSession } from "../../types/app";

function useCountdown(targetIso?: string | null) {
  const [remaining, setRemaining] = useState(0);
  useEffect(() => {
    if (!targetIso) return;
    const tick = () =>
      setRemaining(
        Math.max(
          0,
          Math.floor((new Date(targetIso).getTime() - Date.now()) / 1000),
        ),
      );
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

function mockSectionDuration(session: TestSession | null) {
  const structure = session?.test.mockStructure;
  if (!session?.answerStartedAt || !structure?.sectionTimed)
    return session?.test.answerDurationSec || 0;
  const elapsed = Date.now() - new Date(session.answerStartedAt).getTime();
  let boundary = 0;
  for (const section of structure.sections) {
    boundary += section.minutes * 60 * 1000;
    if (elapsed < boundary) return section.minutes * 60;
  }
  return session.test.answerDurationSec;
}

export function AnswerPage() {
  const { sessionId = "" } = useParams();
  const { token } = useAuth();
  const navigate = useNavigate();
  const [session, setSession] = useState<TestSession | null>(null);
  const [questions, setQuestions] = useState<
    Array<Question & { answer: string | null }>
  >([]);
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [flagged, setFlagged] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [completion, setCompletion] = useState<{
    autoSubmitted: boolean;
  } | null>(null);
  const remaining = useCountdown(session?.answerEndsAt);
  const sectionDeadline = mockSectionDeadline(session);
  const sectionRemaining = useCountdown(sectionDeadline);
  const { dismissTabWarning, showTabWarning, warningMessage } =
    useActiveTestWarning(session?.status === "ANSWERING" && !completion);

  async function load() {
    if (!token) return;
    const [sessionResponse, questionResponse] = await Promise.all([
      api.getSession(token, sessionId),
      api.getAnswerQuestions(token, sessionId),
    ]);
    setSession(sessionResponse.session);
    setQuestions(questionResponse.questions);
    setCurrentPageIndex(0);
  }

  useEffect(() => {
    void load().catch((err) => setError(err.message));
  }, [sessionId, token]);

  useEffect(() => {
    if (sectionDeadline && sectionRemaining === 0) {
      void load().catch((err) => setError(err.message));
    }
  }, [sectionDeadline, sectionRemaining]);

  useExpiryPoll({
    deadlineIso: session?.answerEndsAt,
    enabled: session?.status === "ANSWERING",
    remaining,
    onCheck: async () => {
      if (!token) return "resolved";
      const response = await api.getSession(token, sessionId);
      setSession(response.session);
      if (
        response.session.status === "SUBMITTED" ||
        response.session.status === "AUTO_SUBMITTED"
      ) {
        setCompletion({
          autoSubmitted: response.session.status === "AUTO_SUBMITTED",
        });
        return "resolved";
      }
      return "pending";
    },
  });

  // Catches an admin ending the test early, independent of this student's
  // own countdown — see useSessionWatcher for why useExpiryPoll alone misses it.
  useSessionWatcher({
    enabled: session?.status === "ANSWERING" && !completion,
    onCheck: async () => {
      if (!token) return;
      const response = await api.getSession(token, sessionId);
      if (
        response.session.status === "SUBMITTED" ||
        response.session.status === "AUTO_SUBMITTED"
      ) {
        setSession(response.session);
        setCompletion({
          autoSubmitted: response.session.status === "AUTO_SUBMITTED",
        });
        return;
      }
      setSession(response.session);
    },
  });

  async function saveAnswer(questionId: string, value: string) {
    if (!token) return;
    setQuestions((current) =>
      current.map((question) =>
        question.id === questionId ? { ...question, answer: value } : question,
      ),
    );
    await api.saveAnswer(token, sessionId, {
      questionId,
      selectedOptionKey: value,
    });
    const response = await api.getSession(token, sessionId);
    setSession(response.session);
  }

  async function confirmSubmit() {
    if (!token) return;
    await api.submitSession(token, sessionId);
    const response = await api.getSession(token, sessionId);
    setSession(response.session);
    setShowSubmitModal(false);
    setCompletion({ autoSubmitted: false });
  }

  function toggleFlag(questionId: string) {
    setFlagged((current) => {
      const next = new Set(current);
      if (next.has(questionId)) next.delete(questionId);
      else next.add(questionId);
      return next;
    });
  }

  function toggleGroupFlag(questionIds: string[]) {
    setFlagged((current) => {
      const next = new Set(current);
      const isMarked = questionIds.some((questionId) => next.has(questionId));
      questionIds.forEach((questionId) => {
        if (isMarked) next.delete(questionId);
        else next.add(questionId);
      });
      return next;
    });
  }

  const groups = useMemo(
    () => groupQuestionsByParagraph(questions),
    [questions],
  );
  const pages = useQuestionPages(groups, session?.test.mode === "MOCK");
  const activePageIndex = Math.min(currentPageIndex, Math.max(0, pages.length - 1));
  const currentPage = pages[activePageIndex];
  const contextGroup = currentPage?.groups.length === 1 ? currentPage.groups[0] : null;

  const answeredCount = questions.filter((question) => question.answer).length;
  const unansweredCount = questions.length - answeredCount;

  const pageRawIndexes = currentPage
    ? currentPage.questions.map((question) =>
        questions.findIndex((item) => item.id === question.id),
      )
    : [];
  const rangeLabel =
    pageRawIndexes.length > 1
      ? `Questions ${Math.min(...pageRawIndexes) + 1}-${Math.max(...pageRawIndexes) + 1} of ${questions.length}`
      : `Question ${(pageRawIndexes[0] ?? 0) + 1} of ${questions.length}`;
  const hasContext = Boolean(
    contextGroup?.paragraph || contextGroup?.imagePath,
  );
  const currentSubject = currentPage?.questions[0]?.topic;

  if (completion) {
    const isMockCompletion = session?.test.mode === "MOCK";
    return (
      <div className="test-shell" style={{ overflow: "auto" }}>
        <main className="test-main test-main--single" style={{ maxWidth: 560 }}>
          <div className="card completion-screen">
            <div
              className={`completion-screen__icon ${completion.autoSubmitted ? "completion-screen__icon--warning" : ""}`}
            >
              {completion.autoSubmitted ? (
                <TimerOff size={28} />
              ) : (
                <CheckCircle2 size={28} />
              )}
            </div>
            <h2>
              {isMockCompletion ? "Test submitted" : "Transmission complete"}
            </h2>
            <p>
              {completion.autoSubmitted
                ? isMockCompletion
                  ? "Time ran out and your answers were submitted automatically."
                  : "Time ran out and your answers were beamed in automatically."
                : isMockCompletion
                  ? `Your answers for ${session?.test.title} have been submitted successfully.`
                  : `Your answers for ${session?.test.title} have been transmitted successfully.`}
            </p>
            <div className="completion-screen__stats">
              <div className="stat-card">
                <span>Questions answered</span>
                <strong>
                  {session?.totalAnsweredCount ?? answeredCount} /{" "}
                  {session?.totalSelectedCount ?? questions.length}
                </strong>
              </div>
              <div className="stat-card">
                <span>
                  {isMockCompletion ? "Submission time" : "Transmission time"}
                </span>
                <strong style={{ fontSize: 18 }}>
                  {new Date().toLocaleTimeString([], {
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </strong>
              </div>
            </div>
            <div className="completion-screen__actions">
              <button
                className="ghost-button"
                onClick={() => navigate("/student")}
                type="button"
              >
                Back to tests
              </button>
              <button
                className="primary-button"
                onClick={() =>
                  navigate(`/student/sessions/${sessionId}/result`)
                }
                type="button"
              >
                {isMockCompletion ? "View result" : "View mission report"}
              </button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (!session || !currentPage) {
    return (
      <div className="page-loader">
        {error ? <div className="error-banner">{error}</div> : "Loading test…"}
      </div>
    );
  }

  const isMultiQuestionPage = !hasContext && currentPage.questions.length > 1;
  const questionCards = currentPage.questions.map((question, index) => (
    <div
      className={hasContext ? (index > 0 ? "test-question-box__item" : "") : "card test-question-box question-page-card"}
      key={question.id}
    >
      <QuestionCard
        answer={question.answer}
        bare
        displayNumber={
          questions.findIndex((item) => item.id === question.id) + 1
        }
        hideSharedContent={hasContext}
        interactive
        onAnswer={(value) => void saveAnswer(question.id, value)}
        question={question}
      />
      {isMultiQuestionPage ? (
        <button className={`question-page-flag ${flagged.has(question.id) ? "question-page-flag--active" : ""}`} onClick={() => toggleFlag(question.id)} type="button">
          <Flag size={13} /> {flagged.has(question.id) ? "Flagged" : "Flag"}
        </button>
      ) : null}
    </div>
  ));

  if (session.test.mode === "MOCK") {
    const structure = session.test.mockStructure;
    const currentQuestionIds = currentPage.questions.map(
      (question) => question.id,
    );
    const currentIsMarked = currentQuestionIds.some((questionId) =>
      flagged.has(questionId),
    );
    const isFreeNavigation = structure?.sectionTimed === false;

    return (
      <div className="mock-exam-shell">
        <header className="mock-exam-header">
          <div>
            <p className="mock-exam-header__eyebrow">
              Online Test Application ·{" "}
              {structure?.label || session.test.mockExamType || "Mock"}{" "}
              examination
            </p>
            <h1>{session.test.title}</h1>
          </div>
          <div className="mock-exam-header__timer">
            <span>
              {sectionDeadline
                ? `${currentSubject || "Current section"} time remaining`
                : "Test time remaining"}
            </span>
            <TestTimer
              remainingSeconds={sectionDeadline ? sectionRemaining : remaining}
              totalSeconds={
                sectionDeadline
                  ? mockSectionDuration(session)
                  : session.test.answerDurationSec
              }
            />
          </div>
        </header>

        {structure ? (
          <nav aria-label="Test sections" className="mock-exam-sections">
            {structure.sections.map((section, index) => {
              const sectionPageIndex = pages.findIndex(
                (page) => page.questions[0]?.topic === section.name,
              );
              const isCurrent = section.name === currentSubject;
              const available = isFreeNavigation && sectionPageIndex >= 0;
              return (
                <button
                  className={`mock-exam-section ${isCurrent ? "mock-exam-section--active" : ""}`}
                  disabled={!available && !isCurrent}
                  key={section.name}
                  onClick={() =>
                    available && setCurrentPageIndex(sectionPageIndex)
                  }
                  type="button"
                >
                  <span>Section {index + 1}</span>
                  <strong>{section.name}</strong>
                  <small>
                    {section.questions} questions ·{" "}
                    {isFreeNavigation
                      ? "Shared time"
                      : `${section.minutes} min`}
                  </small>
                </button>
              );
            })}
          </nav>
        ) : null}

        {showTabWarning ? (
          <div className="warning-banner mock-exam-notice">
            <span>
              {warningMessage} Your exam timer continued while you were away.
            </span>
            <button
              className="ghost-button"
              onClick={dismissTabWarning}
              type="button"
            >
              Continue exam
            </button>
          </div>
        ) : null}
        {error ? (
          <div className="error-banner mock-exam-notice">{error}</div>
        ) : null}

        <main className="mock-exam-layout">
          <section className="mock-exam-workspace">
            <div className="mock-exam-workspace__heading">
              <span>{currentSubject || "Questions"}</span>
              <strong>{rangeLabel}</strong>
            </div>
            <div
              className={`mock-exam-question ${hasContext ? "mock-exam-question--split" : ""}`}
            >
              {hasContext ? (
                <ParagraphGroupCard
                  imagePath={contextGroup?.imagePath}
                  paragraph={contextGroup?.paragraph}
                />
              ) : null}
              <div className={`mock-exam-question__content ${isMultiQuestionPage ? "mock-exam-question__content--multi" : ""}`}>{questionCards}</div>
            </div>
          </section>

          <aside className="mock-exam-sidebar">
            <div className="mock-exam-sidebar__profile">
              <span>Candidate</span>
              <strong>Question overview</strong>
              <p>
                {answeredCount} answered · {unansweredCount} not answered
              </p>
            </div>
            <div
              className="mock-exam-legend"
              aria-label="Question status legend"
            >
              <span>
                <i className="mock-exam-legend__answered" /> Answered
              </span>
              <span>
                <i className="mock-exam-legend__unanswered" /> Not answered
              </span>
              <span>
                <i className="mock-exam-legend__marked" /> Marked for review
              </span>
            </div>
            <div className="mock-exam-palette" aria-label="Question palette">
              {groups.map((group) => {
                const ids = group.questions.map((question) => question.id);
                const isAnswered = group.questions.every((question) =>
                  Boolean(question.answer),
                );
                const isMarked = ids.some((questionId) =>
                  flagged.has(questionId),
                );
                const firstNumber =
                  questions.findIndex((question) => question.id === ids[0]) + 1;
                const pageIndex = pages.findIndex((page) => page.groups.some((item) => item.key === group.key));
                return (
                  <button
                    aria-label={`Go to question ${firstNumber}`}
                    className={`mock-exam-palette__item ${pageIndex === activePageIndex ? "mock-exam-palette__item--current" : ""} ${isAnswered ? "mock-exam-palette__item--answered" : ""} ${isMarked ? "mock-exam-palette__item--marked" : ""}`}
                    key={ids.join("-")}
                    onClick={() => setCurrentPageIndex(pageIndex)}
                    type="button"
                  >
                    {group.questions.length > 1
                      ? `${firstNumber}–${firstNumber + group.questions.length - 1}`
                      : firstNumber}
                  </button>
                );
              })}
            </div>
            <button
              className="mock-exam-submit"
              onClick={() => setShowSubmitModal(true)}
              type="button"
            >
              Submit test
            </button>
          </aside>
        </main>

        <footer className="mock-exam-footer">
          <button
            className="mock-exam-nav"
            disabled={activePageIndex === 0}
            onClick={() => setCurrentPageIndex(Math.max(0, activePageIndex - 1))}
            type="button"
          >
            <ChevronLeft size={17} /> Previous
          </button>
          <button
            className={`mock-exam-review ${currentIsMarked ? "mock-exam-review--active" : ""}`}
            onClick={() => toggleGroupFlag(currentQuestionIds)}
            type="button"
          >
            <Flag size={16} />{" "}
            {currentIsMarked ? "Remove review mark" : "Mark for review"}
          </button>
          <button
            className="mock-exam-save"
            disabled={activePageIndex === pages.length - 1}
            onClick={() => setCurrentPageIndex(Math.min(pages.length - 1, activePageIndex + 1))}
            type="button"
          >
            Save & next <ChevronRight size={17} />
          </button>
        </footer>

        {showSubmitModal ? (
          <Modal
            actions={
              <>
                <button
                  className="ghost-button"
                  onClick={() => setShowSubmitModal(false)}
                  type="button"
                >
                  Return to exam
                </button>
                <button
                  className="primary-button"
                  onClick={() => void confirmSubmit()}
                  type="button"
                >
                  Submit test
                </button>
              </>
            }
            onClose={() => setShowSubmitModal(false)}
            title="Submit mock test?"
          >
            <p>
              You have answered{" "}
              <strong>
                {answeredCount} / {questions.length}
              </strong>{" "}
              questions.
            </p>
            {unansweredCount > 0 ? (
              <p style={{ marginTop: 8 }}>
                {unansweredCount} question{unansweredCount === 1 ? "" : "s"}{" "}
                remain unanswered.
              </p>
            ) : null}
            <p style={{ marginTop: 8 }}>
              You cannot change your answers after submission.
            </p>
          </Modal>
        ) : null}
      </div>
    );
  }

  return (
    <div className="test-shell">
      <header className="test-topbar">
        <div className="test-topbar__row">
          <div className="test-topbar__title">
            <span className="test-topbar__brand">Online Test Application</span>
            <span className="test-topbar__phase">{session.test.title}</span>
          </div>
          <TestTimer
            remainingSeconds={sectionDeadline ? sectionRemaining : remaining}
            totalSeconds={
              sectionDeadline
                ? mockSectionDuration(session)
                : session.test.answerDurationSec
            }
          />
        </div>
        <div className="test-topbar__subtitle">
          <span>Answer phase</span>
          <span className="selection-counter">
            {answeredCount} / {questions.length} answered
          </span>
          <button
            className="primary-button"
            onClick={() => setShowSubmitModal(true)}
            type="button"
          >
            Transmit answers
          </button>
        </div>
      </header>

      {showTabWarning ? (
        <div
          className="warning-banner"
          style={{ margin: "0 32px", marginTop: 12 }}
        >
          <span>
            {warningMessage} Your answer time continued while you were away.
          </span>
          <button
            className="ghost-button"
            onClick={dismissTabWarning}
            type="button"
          >
            Stay in test
          </button>
        </div>
      ) : null}

      {error ? (
        <div
          className="error-banner"
          style={{ margin: "0 32px", marginTop: 12 }}
        >
          {error}
        </div>
      ) : null}

      <main
        className={`test-main ${hasContext ? "test-main--split" : "test-main--single"} ${isMultiQuestionPage ? "test-main--multi" : ""}`}
      >
        {hasContext ? (
          <>
            <div className="test-split-pane">
              <ParagraphGroupCard
                imagePath={contextGroup?.imagePath}
                paragraph={contextGroup?.paragraph}
              />
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
                className={`flag-button ${flagged.has(currentPage.questions[0].id) ? "flag-button--active" : ""}`}
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

      {showSubmitModal ? (
        <Modal
          actions={
            <>
              <button
                className="ghost-button"
                onClick={() => setShowSubmitModal(false)}
                type="button"
              >
                Return to test
              </button>
              <button
                className="primary-button"
                onClick={() => void confirmSubmit()}
                type="button"
              >
                Transmit now
              </button>
            </>
          }
          onClose={() => setShowSubmitModal(false)}
          title="Ready to transmit?"
          tone="space"
        >
          <p>
            You have answered{" "}
            <strong>
              {answeredCount} / {questions.length}
            </strong>{" "}
            questions.
          </p>
          {unansweredCount > 0 ? (
            <p style={{ marginTop: 8 }}>
              {unansweredCount} question{unansweredCount === 1 ? "" : "s"}{" "}
              remain unanswered.
            </p>
          ) : null}
          <p style={{ marginTop: 8 }}>
            Once transmitted, your answers cannot be changed.
          </p>
        </Modal>
      ) : null}
    </div>
  );
}
