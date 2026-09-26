import { useState } from 'react';
import { Calculator, Check, ChevronRight, Expand, Flag, HelpCircle, Minimize, PanelRightClose, PanelRightOpen } from 'lucide-react';
import type { Question, TestSession, User } from '../types/app';
import { AnimalAvatar } from './AnimalAvatar';
import { ExamCalculator, QuestionPaper } from './ExamWorkspace';
import { ParagraphGroupCard } from './ParagraphGroupCard';
import { QuestionCard } from './QuestionCard';
import type { QuestionGroup } from '../utils/questionGroups';

type Props = {
  error: string;
  flagged: Set<string>;
  groups: QuestionGroup<Question>[];
  onDismissWarning: () => void;
  onToggleFlag: (questionId: string) => void;
  onToggleGroup: (groupQuestionIds: string[]) => void;
  questions: Question[];
  remainingSeconds: number;
  selectedIds: string[];
  session: TestSession;
  showWarning: boolean;
  thresholdCount: number;
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

export function SelectionWorkspace({ error, flagged, groups, onDismissWarning, onToggleFlag, onToggleGroup, questions, remainingSeconds, selectedIds, session, showWarning, thresholdCount, user, warningMessage }: Props) {
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [visited, setVisited] = useState<Set<string>>(() => new Set(questions[0] ? [questions[0].id] : []));
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [showPaper, setShowPaper] = useState(false);
  const [showCalculator, setShowCalculator] = useState(false);
  const [fullscreen, setFullscreen] = useState(Boolean(document.fullscreenElement));

  const activePageIndex = Math.min(currentPageIndex, Math.max(0, groups.length - 1));
  const currentGroup = groups[activePageIndex];
  const currentQuestion = currentGroup?.questions[0];
  const topicSections = [...new Set(questions.map((question) => question.topic).filter((topic): topic is string => Boolean(topic)))];
  const sections = topicSections.length ? topicSections : [session.test.title || 'Section'];
  const activeSection = currentQuestion?.topic || sections[0];
  const sectionGroups = groups.filter((group) => group.questions.some((question) => question.topic === activeSection));
  const paletteGroups = sectionGroups.length ? sectionGroups : groups;
  const paletteQuestions = paletteGroups.flatMap((group) => group.questions);

  function updateVisited(groupQuestionIds: string[]) {
    setVisited((current) => new Set([...current, ...groupQuestionIds]));
  }

  function goToPage(index: number) {
    const nextGroup = groups[index];
    if (!nextGroup) return;
    updateVisited(nextGroup.questions.map((question) => question.id));
    setCurrentPageIndex(index);
  }

  function goToQuestion(questionId: string) {
    const index = groups.findIndex((group) => group.questions.some((question) => question.id === questionId));
    if (index >= 0) goToPage(index);
  }

  function nextPageIndex() {
    const currentSectionIndex = paletteGroups.findIndex((group) => group.key === currentGroup?.key);
    const nextInSection = paletteGroups[currentSectionIndex + 1];
    if (nextInSection) return groups.findIndex((group) => group.key === nextInSection.key);
    if (activePageIndex < groups.length - 1) return activePageIndex + 1;
    return -1;
  }

  function flagAndNext() {
    if (currentQuestion) onToggleFlag(currentQuestion.id);
    const nextIndex = nextPageIndex();
    if (nextIndex >= 0) goToPage(nextIndex);
  }

  function statusOf(question: Question): QuestionStatus {
    const isFlagged = flagged.has(question.id);
    const isSelected = selectedIds.includes(question.id);
    if (isFlagged && isSelected) return 'answered-marked';
    if (isFlagged) return 'marked';
    if (isSelected) return 'answered';
    if (visited.has(question.id) || question.id === currentQuestion?.id) return 'not-answered';
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
    const index = groups.findIndex((group) => group.questions.some((question) => question.topic === section));
    if (index >= 0) goToPage(index);
  }

  if (!currentGroup || !currentQuestion) return null;

  const isGrouped = currentGroup.questions.length > 1;
  const hasContext = Boolean(currentGroup.paragraph || currentGroup.imagePath);
  const groupQuestionIds = currentGroup.questions.map((question) => question.id);
  const groupSelected = groupQuestionIds.every((id) => selectedIds.includes(id));
  const nextIndex = nextPageIndex();
  const selectedCount = groups.filter((group) => group.questions.some((question) => selectedIds.includes(question.id))).length;

  return (
    <div className={`exam-clone-shell ${sidebarOpen ? '' : 'exam-clone-shell--sidebar-hidden'}`}>
      <header className="exam-clone-topline">
        <span>{session.test.title}</span>
        <button onClick={() => setShowPaper(true)} type="button"><HelpCircle size={17} /> Question Paper</button>
      </header>

      <main className="exam-clone-main">
        <div className="exam-clone-tools">
          <span className="exam-clone-group">{selectedCount} / {thresholdCount} selected <i><Check size={11} /></i></span>
          <div>
            <button aria-label={fullscreen ? 'Exit fullscreen' : 'Enter fullscreen'} onClick={() => void toggleFullscreen()} title="Fullscreen" type="button">{fullscreen ? <Minimize size={20} /> : <Expand size={20} />}</button>
            <button aria-label="Open calculator" onClick={() => setShowCalculator(true)} title="Calculator" type="button"><Calculator size={20} /></button>
          </div>
        </div>
        <div className="exam-clone-section-line"><span>Reading phase &middot; Question selection</span><strong>Time Left: {formatClock(remainingSeconds)}</strong></div>
        <nav aria-label="Exam sections" className="exam-clone-tabs">
          {sections.map((section) => (
            <button className={section === activeSection ? 'active' : ''} key={section} onClick={() => openSection(section)} type="button">{section}</button>
          ))}
        </nav>

        {showWarning ? <div className="warning-banner exam-clone-alert"><span>{warningMessage} Your reading time continued while you were away.</span><button onClick={onDismissWarning} type="button">Continue</button></div> : null}
        {error ? <div className="error-banner exam-clone-alert">{error}</div> : null}

        <div className="exam-clone-meta">{isGrouped ? `${currentGroup.questions.length} questions in this set` : `Type: ${currentQuestion.answerType === 'OPTIONS' ? 'MCQ' : 'Text answer'}`} <span>| Select to answer later</span></div>
        <div className="exam-clone-question-number">
          {isGrouped
            ? `Questions ${questions.findIndex((item) => item.id === currentGroup.questions[0].id) + 1}-${questions.findIndex((item) => item.id === currentGroup.questions.at(-1)!.id) + 1} of ${questions.length}`
            : `Question No. ${questions.findIndex((item) => item.id === currentQuestion.id) + 1}`}
        </div>
        <div className="exam-clone-question-scroll">
          {hasContext ? <ParagraphGroupCard bare imagePath={currentGroup.imagePath} paragraph={currentGroup.paragraph} /> : null}
          {currentGroup.questions.map((question) => (
            <div key={question.id} style={{ marginBottom: 20 }}>
              <QuestionCard
                bare
                displayNumber={questions.findIndex((item) => item.id === question.id) + 1}
                hideSharedContent={hasContext}
                onToggleSelect={isGrouped ? undefined : () => onToggleGroup([question.id])}
                previewOnly={isGrouped}
                question={question}
                selectable={!isGrouped}
                selected={selectedIds.includes(question.id)}
              />
            </div>
          ))}
        </div>
      </main>

      <footer className="exam-clone-footer">
        <div>
          <button className="exam-clone-review-button" onClick={flagAndNext} type="button"><Flag size={14} /> Flag & Next</button>
          <button className="exam-clone-clear-button" disabled={!groupSelected} onClick={() => onToggleGroup(groupQuestionIds)} type="button">Deselect</button>
        </div>
        <button
          className="exam-clone-save-button"
          onClick={() => {
            if (!groupSelected) onToggleGroup(groupQuestionIds);
            if (nextIndex >= 0) goToPage(nextIndex);
          }}
          type="button"
        >
          {groupSelected ? 'Next' : 'Select & Next'} <ChevronRight size={17} />
        </button>
      </footer>

      <aside className="exam-clone-sidebar">
        <div className="exam-clone-candidate"><AnimalAvatar avatar={user?.avatar} size="md" /><div><span>Candidate</span><strong>{user?.name || 'Student'}</strong></div></div>
        <div className="exam-clone-legend">
          <span><i className="status-answered">{statusCounts.answered}</i> Selected</span>
          <span><i className="status-not-answered">{statusCounts['not-answered']}</i> Not Selected</span>
          <span><i className="status-not-visited">{statusCounts['not-visited']}</i> Not Visited</span>
          <span><i className="status-marked">{statusCounts.marked}</i> Flagged</span>
          <span><i className="status-answered-marked">{statusCounts['answered-marked']}</i> Selected & Flagged</span>
        </div>
        <div className="exam-clone-palette-title">{activeSection}</div>
        <div className="exam-clone-palette-label">Choose a Question</div>
        <div className="exam-clone-palette">
          {paletteQuestions.map((question) => {
            const index = questions.findIndex((item) => item.id === question.id);
            return <button aria-current={currentGroup.questions.some((item) => item.id === question.id) ? 'true' : undefined} aria-label={`Question ${index + 1}: ${statusOf(question).replaceAll('-', ' ')}`} className={`status-${statusOf(question)}`} key={question.id} onClick={() => goToQuestion(question.id)} type="button">{index + 1}</button>;
          })}
        </div>
      </aside>

      <button aria-label={sidebarOpen ? 'Hide question palette' : 'Show question palette'} className="exam-clone-sidebar-toggle" onClick={() => setSidebarOpen((open) => !open)} type="button">{sidebarOpen ? <PanelRightClose size={18} /> : <PanelRightOpen size={18} />}</button>

      {showPaper ? <QuestionPaper onClose={() => setShowPaper(false)} questions={questions} /> : null}
      {showCalculator ? <ExamCalculator onClose={() => setShowCalculator(false)} /> : null}
    </div>
  );
}
