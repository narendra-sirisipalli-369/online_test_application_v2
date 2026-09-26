import { useState } from 'react';
import { Calculator, ChevronRight, Expand, HelpCircle, Minimize, PanelRightClose, PanelRightOpen, X } from 'lucide-react';
import type { Question, TestSession, User } from '../types/app';
import { ContentBlockList } from './ContentBlockList';
import { AnimalAvatar } from './AnimalAvatar';
import { Modal } from './Modal';
import { ParagraphGroupCard } from './ParagraphGroupCard';
import { QuestionCard } from './QuestionCard';
import { parseStructuredText } from '../utils/contentBlocks';

type ExamQuestion = Question & { answer: string | null };

type Props = {
  error: string;
  onAnswer: (questionId: string, value: string) => void;
  onClearAnswer: (questionId: string) => void;
  onDismissWarning: () => void;
  onSubmit: () => void;
  questions: ExamQuestion[];
  remainingSeconds: number;
  sectionRemainingSeconds?: number;
  sectionTimed: boolean;
  session: TestSession;
  showWarning: boolean;
  user?: User | null;
  warningMessage: string;
};

type QuestionStatus = 'answered' | 'not-answered' | 'not-visited' | 'marked' | 'answered-marked';

function formatClock(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return hours > 0
    ? `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
    : `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function readStoredSet(key: string) {
  try {
    return new Set<string>(JSON.parse(window.localStorage.getItem(key) || '[]'));
  } catch {
    return new Set<string>();
  }
}

function storeSet(key: string, values: Set<string>) {
  window.localStorage.setItem(key, JSON.stringify([...values]));
}

function evaluateExpression(expression: string) {
  const compact = expression.replace(/\s+/g, '');
  const tokens = compact.match(/\d*\.?\d+|[()+\-*/]/g);
  if (!tokens || tokens.join('') !== compact) throw new Error('Invalid expression');

  const values: number[] = [];
  const operators: string[] = [];
  const precedence = (operator: string) => operator === '+' || operator === '-' ? 1 : 2;
  const apply = () => {
    const operator = operators.pop();
    const right = values.pop();
    const left = values.pop();
    if (!operator || left == null || right == null) throw new Error('Invalid expression');
    if (operator === '+') values.push(left + right);
    if (operator === '-') values.push(left - right);
    if (operator === '*') values.push(left * right);
    if (operator === '/') values.push(left / right);
  };

  tokens.forEach((token, index) => {
    if (/^\d/.test(token) || token.startsWith('.')) {
      values.push(Number(token));
      return;
    }
    if (token === '(') {
      operators.push(token);
      return;
    }
    if (token === ')') {
      while (operators.length && operators.at(-1) !== '(') apply();
      if (operators.pop() !== '(') throw new Error('Invalid expression');
      return;
    }
    if (token === '-' && (index === 0 || ['(', '+', '-', '*', '/'].includes(tokens[index - 1]))) values.push(0);
    while (operators.length && operators.at(-1) !== '(' && precedence(operators.at(-1)!) >= precedence(token)) apply();
    operators.push(token);
  });
  while (operators.length) apply();
  if (values.length !== 1 || !Number.isFinite(values[0])) throw new Error('Invalid expression');
  return String(Number(values[0].toFixed(10)));
}

export function ExamCalculator({ onClose }: { onClose: () => void }) {
  const [expression, setExpression] = useState('');
  const keys = ['7', '8', '9', '/', '4', '5', '6', '*', '1', '2', '3', '-', '0', '.', '(', ')', 'C', '⌫', '+', '='];

  function press(key: string) {
    if (key === 'C') return setExpression('');
    if (key === '⌫') return setExpression((value) => value.slice(0, -1));
    if (key === '=') {
      try {
        setExpression(evaluateExpression(expression));
      } catch {
        setExpression('Error');
      }
      return;
    }
    setExpression((value) => value === 'Error' ? key : `${value}${key}`);
  }

  return (
    <div className="exam-tool-backdrop" onClick={onClose}>
      <section aria-label="Calculator" aria-modal="true" className="exam-calculator" onClick={(event) => event.stopPropagation()} role="dialog">
        <header><strong>Calculator</strong><button aria-label="Close calculator" onClick={onClose} type="button"><X size={18} /></button></header>
        <output>{expression || '0'}</output>
        <div className="exam-calculator__keys">
          {keys.map((key) => <button className={key === '=' ? 'exam-calculator__equals' : ''} key={key} onClick={() => press(key)} type="button">{key}</button>)}
        </div>
      </section>
    </div>
  );
}

export function QuestionPaper({ onClose, questions }: { onClose: () => void; questions: (Question & { answer?: string | null })[] }) {
  const subjects = [...new Set(questions.map((question) => question.topic || 'Questions'))];
  return (
    <div className="exam-paper-backdrop" onClick={onClose}>
      <section aria-labelledby="question-paper-title" aria-modal="true" className="exam-paper" onClick={(event) => event.stopPropagation()} role="dialog">
        <header><h2 id="question-paper-title">Question Paper</h2><button aria-label="Close question paper" onClick={onClose} type="button"><X size={20} /></button></header>
        <div className="exam-paper__body">
          {subjects.map((subject) => (
            <section className="exam-paper__section" key={subject}>
              <h3>{subject}</h3>
              {questions.filter((question) => (question.topic || 'Questions') === subject).map((question) => (
                <article className="exam-paper__question" key={question.id}>
                  <strong>Q.{questions.findIndex((item) => item.id === question.id) + 1}</strong>
                  <div>
                    <ContentBlockList blocks={parseStructuredText(question.questionText)} />
                    <small>Question type: {question.answerType === 'OPTIONS' ? 'MCQ' : 'Text answer'} · Correct answer +1 · Incorrect answer 0</small>
                  </div>
                </article>
              ))}
            </section>
          ))}
        </div>
        <footer><button onClick={onClose} type="button">Close</button></footer>
      </section>
    </div>
  );
}

export function ExamWorkspace({ error, onAnswer, onClearAnswer, onDismissWarning, onSubmit, questions, remainingSeconds, sectionRemainingSeconds, sectionTimed, session, showWarning, user, warningMessage }: Props) {
  const flagKey = `exam-flags-${session.id}`;
  const visitKey = `exam-visits-${session.id}`;
  const [currentIndex, setCurrentIndex] = useState(0);
  const [flagged, setFlagged] = useState<Set<string>>(() => readStoredSet(flagKey));
  const [visited, setVisited] = useState<Set<string>>(() => {
    const stored = readStoredSet(visitKey);
    if (questions[0]) stored.add(questions[0].id);
    return stored;
  });
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [showPaper, setShowPaper] = useState(false);
  const [showCalculator, setShowCalculator] = useState(false);
  const [showSubmit, setShowSubmit] = useState(false);
  const [fullscreen, setFullscreen] = useState(Boolean(document.fullscreenElement));

  const activeIndex = Math.min(currentIndex, Math.max(0, questions.length - 1));
  const currentQuestion = questions[activeIndex];
  const structureSections = session.test.mockStructure?.sections || [];
  const topicSections = [...new Set(questions.map((question) => question.topic).filter((topic): topic is string => Boolean(topic)))];
  const sections = structureSections.length
    ? structureSections.map((section) => section.name)
    : topicSections.length ? topicSections : [session.test.title || 'Section'];
  const activeSection = currentQuestion?.topic || sections[0];
  const sectionQuestions = questions.filter((question) => question.topic === activeSection);
  const paletteQuestions = sectionQuestions.length ? sectionQuestions : questions;
  const timeLeft = sectionTimed && sectionRemainingSeconds != null ? sectionRemainingSeconds : remainingSeconds;

  function updateVisited(questionId: string) {
    setVisited((current) => {
      const next = new Set(current).add(questionId);
      storeSet(visitKey, next);
      return next;
    });
  }

  function goToQuestion(index: number) {
    const nextQuestion = questions[index];
    if (!nextQuestion) return;
    updateVisited(nextQuestion.id);
    setCurrentIndex(index);
  }

  function nextQuestionIndex() {
    const currentSectionIndex = paletteQuestions.findIndex((question) => question.id === currentQuestion.id);
    const nextInSection = paletteQuestions[currentSectionIndex + 1];
    if (nextInSection) return questions.findIndex((question) => question.id === nextInSection.id);
    if (!sectionTimed && activeIndex < questions.length - 1) return activeIndex + 1;
    return -1;
  }

  function markForReviewAndNext() {
    setFlagged((current) => {
      const next = new Set(current).add(currentQuestion.id);
      storeSet(flagKey, next);
      return next;
    });
    const nextIndex = nextQuestionIndex();
    if (nextIndex >= 0) goToQuestion(nextIndex);
  }

  function statusOf(question: ExamQuestion): QuestionStatus {
    const isMarked = flagged.has(question.id);
    if (isMarked && question.answer) return 'answered-marked';
    if (isMarked) return 'marked';
    if (question.answer) return 'answered';
    if (visited.has(question.id) || question.id === currentQuestion.id) return 'not-answered';
    return 'not-visited';
  }

  const statusCounts = paletteQuestions.reduce((counts, question) => {
    counts[statusOf(question)] += 1;
    return counts;
  }, { answered: 0, 'not-answered': 0, 'not-visited': 0, marked: 0, 'answered-marked': 0 } as Record<QuestionStatus, number>);

  async function toggleFullscreen() {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
    setFullscreen(Boolean(document.fullscreenElement));
  }

  function openSection(section: string) {
    if (sectionTimed && section !== activeSection) return;
    const index = questions.findIndex((question) => question.topic === section);
    if (index >= 0) goToQuestion(index);
  }

  const nextIndex = currentQuestion ? nextQuestionIndex() : -1;
  const answeredCount = questions.filter((question) => Boolean(question.answer)).length;

  return (
    <div className={`exam-clone-shell ${sidebarOpen ? '' : 'exam-clone-shell--sidebar-hidden'}`}>
      <header className="exam-clone-topline">
        <span>{session.test.title}</span>
        <button onClick={() => setShowPaper(true)} type="button"><HelpCircle size={17} /> Question Paper</button>
      </header>

      <main className="exam-clone-main">
        <div className="exam-clone-tools">
          <span className="exam-clone-group">Group 1 <i>i</i></span>
          <div>
            <button aria-label={fullscreen ? 'Exit fullscreen' : 'Enter fullscreen'} onClick={() => void toggleFullscreen()} title="Fullscreen" type="button">{fullscreen ? <Minimize size={20} /> : <Expand size={20} />}</button>
            <button aria-label="Open calculator" onClick={() => setShowCalculator(true)} title="Calculator" type="button"><Calculator size={20} /></button>
          </div>
        </div>
        <div className="exam-clone-section-line"><span>Section</span><strong>Time Left: {formatClock(timeLeft)}</strong></div>
        <nav aria-label="Exam sections" className="exam-clone-tabs">
          {sections.map((section) => (
            <button className={section === activeSection ? 'active' : ''} disabled={sectionTimed && section !== activeSection} key={section} onClick={() => openSection(section)} type="button">{section}</button>
          ))}
        </nav>

        {showWarning ? <div className="warning-banner exam-clone-alert"><span>{warningMessage} Your timer continued while you were away.</span><button onClick={onDismissWarning} type="button">Continue exam</button></div> : null}
        {error ? <div className="error-banner exam-clone-alert">{error}</div> : null}

        <div className="exam-clone-meta">Type: {currentQuestion.answerType === 'OPTIONS' ? 'MCQ' : 'Text answer'} <span>| Correct: +1</span> <i>| Incorrect: 0</i></div>
        <div className="exam-clone-question-number">Question No. {activeIndex + 1}</div>
        <div className="exam-clone-question-scroll">
          {currentQuestion.paragraph || currentQuestion.imagePath ? <ParagraphGroupCard bare imagePath={currentQuestion.imagePath} paragraph={currentQuestion.paragraph} /> : null}
          <QuestionCard answer={currentQuestion.answer} bare displayNumber={0} hideSharedContent interactive onAnswer={(value) => onAnswer(currentQuestion.id, value)} question={currentQuestion} />
        </div>
      </main>

      <footer className="exam-clone-footer">
        <div>
          <button className="exam-clone-review-button" onClick={markForReviewAndNext} type="button">Mark for Review & Next</button>
          <button className="exam-clone-clear-button" disabled={!currentQuestion.answer} onClick={() => onClearAnswer(currentQuestion.id)} type="button">Clear Response</button>
        </div>
        <button className="exam-clone-save-button" disabled={nextIndex < 0} onClick={() => nextIndex >= 0 && goToQuestion(nextIndex)} type="button">Save & Next <ChevronRight size={17} /></button>
      </footer>

      <aside className="exam-clone-sidebar">
        <div className="exam-clone-candidate"><AnimalAvatar avatar={user?.avatar} size="md" /><div><span>Candidate</span><strong>{user?.name || 'Student'}</strong></div></div>
        <div className="exam-clone-legend">
          <span><i className="status-answered">{statusCounts.answered}</i> Answered</span>
          <span><i className="status-not-answered">{statusCounts['not-answered']}</i> Not Answered</span>
          <span><i className="status-not-visited">{statusCounts['not-visited']}</i> Not Visited</span>
          <span><i className="status-marked">{statusCounts.marked}</i> Marked for Review</span>
          <span><i className="status-answered-marked">{statusCounts['answered-marked']}</i> Answered & Marked for Review</span>
        </div>
        <div className="exam-clone-palette-title">{activeSection}</div>
        <div className="exam-clone-palette-label">Choose a Question</div>
        <div className="exam-clone-palette">
          {paletteQuestions.map((question) => {
            const index = questions.findIndex((item) => item.id === question.id);
            return <button aria-current={index === activeIndex ? 'true' : undefined} aria-label={`Question ${index + 1}: ${statusOf(question).replaceAll('-', ' ')}`} className={`status-${statusOf(question)}`} key={question.id} onClick={() => goToQuestion(index)} type="button">{index + 1}</button>;
          })}
        </div>
        <button className="exam-clone-submit-button" onClick={() => setShowSubmit(true)} type="button">Submit</button>
      </aside>

      <button aria-label={sidebarOpen ? 'Hide question palette' : 'Show question palette'} className="exam-clone-sidebar-toggle" onClick={() => setSidebarOpen((open) => !open)} type="button">{sidebarOpen ? <PanelRightClose size={18} /> : <PanelRightOpen size={18} />}</button>

      {showPaper ? <QuestionPaper onClose={() => setShowPaper(false)} questions={questions} /> : null}
      {showCalculator ? <ExamCalculator onClose={() => setShowCalculator(false)} /> : null}
      {showSubmit ? (
        <Modal actions={<><button className="ghost-button" onClick={() => setShowSubmit(false)} type="button">Return to exam</button><button className="primary-button" onClick={onSubmit} type="button">Submit test</button></>} onClose={() => setShowSubmit(false)} title="Submit test?">
          <p>You have answered <strong>{answeredCount} of {questions.length}</strong> questions.</p>
          <p style={{ marginTop: 8 }}>{questions.length - answeredCount} question{questions.length - answeredCount === 1 ? '' : 's'} remain unanswered. Answers cannot be changed after submission.</p>
        </Modal>
      ) : null}
    </div>
  );
}
