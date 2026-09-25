import { useEffect, useMemo, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, FileText, Search } from 'lucide-react';
import { api } from '../../api/client';
import { Badge } from '../../components/Badge';
import { GroupedQuestionPicker } from '../../components/GroupedQuestionPicker';
import { PageHeader } from '../../components/PageHeader';
import { useAuth } from '../../context/AuthContext';
import { groupQuestionsByParagraph } from '../../utils/questionGroups';
import type { BankSummary, Question, Test } from '../../types/app';

const STEPS = [
  { key: 'details', label: 'Test details' },
  { key: 'bank', label: 'Choose bank' },
  { key: 'questions', label: 'Pick questions' },
  { key: 'threshold', label: 'Selection rule' },
  { key: 'reading', label: 'Reading time' },
  { key: 'answering', label: 'Answer time' },
  { key: 'review', label: 'Review & publish' },
] as const;

type StepKey = typeof STEPS[number]['key'];

type MockExam = 'CAT' | 'IPMAT_INDORE' | 'IPMAT_ROHTAK';
type MockTemplate = { label: string; totalMinutes: number; sectionTimed: boolean; sections: Array<{ name: string; questions: number; minutes: number }> };
const MOCK_TEMPLATES: Record<MockExam, MockTemplate> = {
  CAT: { label: 'CAT', totalMinutes: 120, sectionTimed: true, sections: [{ name: 'VARC', questions: 24, minutes: 40 }, { name: 'DILR', questions: 22, minutes: 40 }, { name: 'QA', questions: 22, minutes: 40 }] },
  IPMAT_INDORE: { label: 'IPMAT Indore', totalMinutes: 120, sectionTimed: true, sections: [{ name: 'QA MCQ', questions: 30, minutes: 40 }, { name: 'QA SA', questions: 15, minutes: 40 }, { name: 'VA', questions: 45, minutes: 40 }] },
  IPMAT_ROHTAK: { label: 'IPMAT Rohtak', totalMinutes: 120, sectionTimed: false, sections: [{ name: 'QA', questions: 40, minutes: 120 }, { name: 'LR', questions: 40, minutes: 120 }, { name: 'VA', questions: 40, minutes: 120 }] },
};

export function AdminTestsPage() {
  const { token } = useAuth();

  const [step, setStep] = useState<StepKey>('details');

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [testMode, setTestMode] = useState<'SECTIONAL' | 'MOCK'>('SECTIONAL');
  const [mockExamType, setMockExamType] = useState<MockExam>('CAT');
  const [scheduledStartAt, setScheduledStartAt] = useState('');
  const [scheduledEndAt, setScheduledEndAt] = useState('');

  const [banks, setBanks] = useState<BankSummary[]>([]);
  const [selectedBankId, setSelectedBankId] = useState<string | null>(null);
  const [selectedBankName, setSelectedBankName] = useState('');

  const [bankQuestions, setBankQuestions] = useState<Question[]>([]);
  const [selectedQuestionIds, setSelectedQuestionIds] = useState<string[]>([]);
  const [loadingQuestions, setLoadingQuestions] = useState(false);

  const [thresholdCount, setThresholdCount] = useState(1);
  const [readingMinutes, setReadingMinutes] = useState(2);
  const [answerMinutes, setAnswerMinutes] = useState(5);

  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [tests, setTests] = useState<Test[]>([]);
  const [allQuestions, setAllQuestions] = useState<Question[]>([]);
  const [expandedTestId, setExpandedTestId] = useState<string | null>(null);
  const [expandedSelection, setExpandedSelection] = useState<string[]>([]);
  const [manageSearch, setManageSearch] = useState('');
  const [testSearch, setTestSearch] = useState('');
  const [testStatus, setTestStatus] = useState('ALL');
  const [testPage, setTestPage] = useState(1);

  async function loadAll() {
    if (!token) return;
    const [testResponse, questionResponse, bankResponse] = await Promise.all([
      api.adminTests(token),
      api.adminQuestions(token),
      api.adminBanks(token),
    ]);
    setTests(testResponse.tests);
    setAllQuestions(questionResponse.questions);
    setBanks(bankResponse.banks);
  }

  useEffect(() => {
    void loadAll();
  }, [token]);

  async function chooseBank(bank: BankSummary) {
    if (!token) return;
    setError('');
    setSelectedBankId(bank.id);
    setSelectedBankName(bank.name);
    setLoadingQuestions(true);
    try {
      const response = await api.adminBankQuestions(token, bank.id);
      setBankQuestions(response.questions);
      setSelectedQuestionIds(response.questions.map((question) => question.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load this bank's questions");
    } finally {
      setLoadingQuestions(false);
    }
  }

  const availableBanks = banks.filter((bank) => testMode === 'SECTIONAL'
    || (bank.type === 'MANUAL' && bank.mockExamType === mockExamType));

  function toggleQuestion(id: string) {
    setSelectedQuestionIds((current) => (current.includes(id) ? current.filter((qid) => qid !== id) : [...current, id]));
  }

  function toggleGroupSelection(groupIds: string[], select: boolean) {
    setSelectedQuestionIds((current) => {
      const withoutGroup = current.filter((id) => !groupIds.includes(id));
      return select ? [...withoutGroup, ...groupIds] : withoutGroup;
    });
  }

  async function persistQuestionUpdate(question: Question, patch: Partial<Question>) {
    if (!token) return null;
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
    return merged;
  }

  async function quickSetAnswer(question: Question, value: string) {
    setError('');
    try {
      const merged = await persistQuestionUpdate(question, question.answerType === 'TEXT' ? { correctTextAnswer: value } : { correctOptionKey: value });
      if (merged) setBankQuestions((current) => current.map((item) => (item.id === question.id ? merged : item)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save answer');
    }
  }

  async function toggleGroupApproval(groupQuestions: Question[]) {
    setError('');
    const approved = !groupQuestions.every((question) => question.finalApproved);
    try {
      const updates = await Promise.all(groupQuestions.map((question) => persistQuestionUpdate(question, {
        finalApproved: approved,
        verificationStatus: approved ? 'APPROVED' : 'NEEDS_EDIT',
      })));
      setBankQuestions((current) => current.map((item) => updates.find((updated) => updated?.id === item.id) || item));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update approval');
    }
  }

  async function quickSetManageAnswer(question: Question, value: string) {
    setError('');
    try {
      const merged = await persistQuestionUpdate(question, question.answerType === 'TEXT' ? { correctTextAnswer: value } : { correctOptionKey: value });
      if (merged) setAllQuestions((current) => current.map((item) => (item.id === question.id ? merged : item)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save answer');
    }
  }

  async function toggleManageGroupApproval(groupQuestions: Question[]) {
    setError('');
    const approved = !groupQuestions.every((question) => question.finalApproved);
    try {
      const updates = await Promise.all(groupQuestions.map((question) => persistQuestionUpdate(question, {
        finalApproved: approved,
        verificationStatus: approved ? 'APPROVED' : 'NEEDS_EDIT',
      })));
      setAllQuestions((current) => current.map((item) => updates.find((updated) => updated?.id === item.id) || item));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update approval');
    }
  }

  function toggleManageQuestion(id: string) {
    setExpandedSelection((current) => (current.includes(id) ? current.filter((qid) => qid !== id) : [...current, id]));
  }

  function toggleManageGroupSelection(groupIds: string[], select: boolean) {
    setExpandedSelection((current) => {
      const withoutGroup = current.filter((id) => !groupIds.includes(id));
      return select ? [...withoutGroup, ...groupIds] : withoutGroup;
    });
  }

  const selectedQuestions = bankQuestions.filter((question) => selectedQuestionIds.includes(question.id));
  const mockTemplate = MOCK_TEMPLATES[mockExamType];
  const mockSectionCounts = Object.fromEntries(mockTemplate.sections.map((section) => [section.name, selectedQuestions.filter((question) => question.topic === section.name).length]));
  const unansweredSelected = selectedQuestions.filter((question) => (
    question.answerType === 'TEXT' ? !question.correctTextAnswer?.trim() : !question.correctOptionKey
  ));
  const unapprovedSelected = selectedQuestions.filter((question) => !question.finalApproved);

  // A passage and its sub-question(s) count as one question set everywhere a
  // count matters — "select 5 questions" means 5 sets, not 5 raw rows.
  const bankGroups = useMemo(() => groupQuestionsByParagraph(bankQuestions), [bankQuestions]);
  const selectedGroupCount = useMemo(
    () => bankGroups.filter((group) => group.questions.some((question) => selectedQuestionIds.includes(question.id))).length,
    [bankGroups, selectedQuestionIds],
  );

  const currentStepIndex = STEPS.findIndex((item) => item.key === step);

  function goBack() {
    setError('');
    if (testMode === 'MOCK' && step === 'answering') {
      setStep('questions');
      return;
    }
    if (currentStepIndex > 0) {
      setStep(STEPS[currentStepIndex - 1].key);
    }
  }

  function goNext() {
    setError('');
    if (step === 'details') {
      if (!title.trim()) return setError('Please enter a test title.');
      if (!scheduledStartAt || !scheduledEndAt) return setError('Please set both the scheduled start and end.');
      if (new Date(scheduledEndAt) <= new Date(scheduledStartAt)) return setError('Scheduled end must be after the scheduled start.');
      setStep('bank');
      return;
    }
    if (step === 'bank') {
      if (!selectedBankId) return setError('Please choose a question bank.');
      if (loadingQuestions) return setError("Please wait for the bank's questions to finish loading.");
      setStep('questions');
      return;
    }
    if (step === 'questions') {
      if (!selectedQuestionIds.length) return setError('Please select at least one question.');
      if (unansweredSelected.length) return setError(`${unansweredSelected.length} selected question(s) are missing a correct answer. Set them above before continuing.`);
      if (unapprovedSelected.length) return setError(`${unapprovedSelected.length} selected question(s) are not approved yet. Approve them above before continuing.`);
      if (testMode === 'MOCK') {
        const mismatch = mockTemplate.sections.find((section) => mockSectionCounts[section.name] !== section.questions);
        if (mismatch) return setError(`${mockTemplate.label} requires ${mismatch.questions} ${mismatch.name} questions; ${mockSectionCounts[mismatch.name] || 0} are selected.`);
      }
      setThresholdCount((current) => Math.min(Math.max(current, 1), selectedGroupCount));
      setStep(testMode === 'MOCK' ? 'answering' : 'threshold');
      return;
    }
    if (step === 'threshold') {
      if (thresholdCount < 1 || thresholdCount > selectedGroupCount) return setError(`Threshold must be between 1 and ${selectedGroupCount}.`);
      setStep('reading');
      return;
    }
    if (step === 'reading') {
      if (readingMinutes < 1) return setError('Reading time must be at least 1 minute.');
      setStep('answering');
      return;
    }
    if (step === 'answering') {
      if (answerMinutes < 1) return setError('Answer time must be at least 1 minute.');
      setStep('review');
    }
  }

  function resetWizard() {
    setStep('details');
    setTitle('');
    setDescription('');
    setTestMode('SECTIONAL');
    setMockExamType('CAT');
    setScheduledStartAt('');
    setScheduledEndAt('');
    setSelectedBankId(null);
    setSelectedBankName('');
    setBankQuestions([]);
    setSelectedQuestionIds([]);
    setThresholdCount(1);
    setReadingMinutes(2);
    setAnswerMinutes(5);
  }

  async function publishNewTest() {
    if (!token) return;
    setError('');
    setSubmitting(true);
    try {
      const created = await api.createTest(token, {
        title: title.trim(),
        description: description.trim() || undefined,
        mode: testMode,
        mockExamType: testMode === 'MOCK' ? mockExamType : null,
        mockStructure: testMode === 'MOCK' ? mockTemplate : undefined,
        scheduledStartAt: new Date(scheduledStartAt).toISOString(),
        scheduledEndAt: new Date(scheduledEndAt).toISOString(),
        readingDurationSec: testMode === 'MOCK' ? 60 : readingMinutes * 60,
        answerDurationSec: (testMode === 'MOCK' ? mockTemplate.totalMinutes : answerMinutes) * 60,
        thresholdCount: testMode === 'MOCK' ? selectedGroupCount : thresholdCount,
        allowAboveThreshold: testMode === 'MOCK',
        maxSelectableCount: testMode === 'MOCK' ? null : thresholdCount,
        questionOrderMode: 'FIXED',
        optionOrderMode: 'FIXED',
        resultVisibility: 'AFTER_SUBMISSION',
      });
      const questionIdsForTest = testMode === 'MOCK'
        ? mockTemplate.sections.flatMap((section) => selectedQuestions.filter((question) => question.topic === section.name).map((question) => question.id))
        : selectedQuestionIds;
      await api.attachQuestions(token, created.test.id, questionIdsForTest);
      await api.publishTest(token, created.test.id);
      setMessage(`"${title.trim()}" is published and live for students.`);
      resetWizard();
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to publish this test');
    } finally {
      setSubmitting(false);
    }
  }

  function toggleExpand(test: Test) {
    if (expandedTestId === test.id) {
      setExpandedTestId(null);
      return;
    }
    setExpandedTestId(test.id);
    setExpandedSelection(test.questions?.map((item) => item.question.id) || []);
    setManageSearch('');
  }

  async function saveTestQuestions(testId: string) {
    if (!token) return;
    await api.attachQuestions(token, testId, expandedSelection);
    setMessage('Test questions updated');
    await loadAll();
  }

  async function publishExisting(testId: string) {
    if (!token) return;
    setError('');
    try {
      await api.publishTest(token, testId);
      setMessage('Test published');
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to publish test');
    }
  }

  const filteredAllQuestions = allQuestions.filter((question) => {
    if (!manageSearch.trim()) return true;
    const haystack = `${question.questionText} ${question.topic || ''}`.toLowerCase();
    return haystack.includes(manageSearch.toLowerCase());
  });
  const filteredTests = tests.filter((test) =>
    (testStatus === 'ALL' || test.status === testStatus)
    && test.title.toLowerCase().includes(testSearch.toLowerCase()));
  const testPageSize = 8;
  const testPageCount = Math.max(1, Math.ceil(filteredTests.length / testPageSize));
  const currentTestPage = Math.min(testPage, testPageCount);
  const visibleTests = filteredTests.slice((currentTestPage - 1) * testPageSize, currentTestPage * testPageSize);

  return (
    <div className="stack-lg">
      <PageHeader
        description="Walk through a bank, its questions, the selection rule, and timers — then publish."
        eyebrow="Admin workspace"
        title="Tests"
      />

      {message ? <div className="success-banner">{message}</div> : null}
      {error ? <div className="error-banner">{error}</div> : null}

      <section className="card stack">
        <h2>Create test</h2>

        <div className="wizard-steps">
          {STEPS.map((item, index) => {
            const state = index === currentStepIndex ? 'active' : index < currentStepIndex ? 'done' : '';
            return (
              <div className={`wizard-steps__item ${state ? `wizard-steps__item--${state}` : ''}`} key={item.key}>
                <span className="wizard-steps__index">{state === 'done' ? <Check size={11} /> : index + 1}</span>
                {item.label}
              </div>
            );
          })}
        </div>

        {step === 'details' ? (
          <div className="stack">
            <label><span>Test title</span><input onChange={(event) => setTitle(event.target.value)} placeholder="For example, Weekly reasoning practice" value={title} /></label>
            <label>
              <span>Test type</span>
              <select onChange={(event) => setTestMode(event.target.value as 'SECTIONAL' | 'MOCK')} value={testMode}>
                <option value="SECTIONAL">Sectional test</option>
                <option value="MOCK">Full mock test</option>
              </select>
            </label>
            {testMode === 'MOCK' ? (
              <label>
                <span>Mock exam</span>
                <select onChange={(event) => setMockExamType(event.target.value as MockExam)} value={mockExamType}>
                  <option value="CAT">CAT</option>
                  <option value="IPMAT_INDORE">IPMAT Indore</option>
                  <option value="IPMAT_ROHTAK">IPMAT Rohtak</option>
                </select>
              </label>
            ) : null}
            <label><span>Description (optional)</span><textarea onChange={(event) => setDescription(event.target.value)} placeholder="Tell students what this test covers" value={description} /></label>
            <div className="two-col">
              <label>
                <span>Scheduled start</span>
                <input onChange={(event) => setScheduledStartAt(event.target.value ? new Date(event.target.value).toISOString() : '')} type="datetime-local" />
              </label>
              <label>
                <span>Scheduled end</span>
                <input onChange={(event) => setScheduledEndAt(event.target.value ? new Date(event.target.value).toISOString() : '')} type="datetime-local" />
              </label>
            </div>
          </div>
        ) : null}

        {step === 'bank' ? (
          <div className="stack">
            <p className="muted-text">{testMode === 'MOCK' ? `Choose a manually entered ${mockExamType} mock question bank. Imported documents cannot be used for mock tests.` : "Choose the question bank this test's questions will come from."}</p>
            {availableBanks.length ? (
              <div className="bank-grid">
                {availableBanks.map((bank) => (
                  <button
                    className={`bank-tile ${selectedBankId === bank.id ? 'bank-tile--selected' : ''}`}
                    key={bank.id}
                    onClick={() => void chooseBank(bank)}
                    type="button"
                  >
                    <div className="bank-tile__icon"><FileText size={20} /></div>
                    <div className="bank-tile__body">
                      <div className="bank-tile__name">{bank.name}</div>
                      <span className="muted-text text-small">{bank.questionCount} question{bank.questionCount === 1 ? '' : 's'}</span>
                    </div>
                    <Badge tone={bank.type === 'IMPORTED' ? 'info' : 'neutral'} value={bank.mockExamType ? `${bank.mockExamType} mock` : bank.type === 'IMPORTED' ? 'Imported' : 'Manual'} />
                  </button>
                ))}
              </div>
            ) : (
              <p className="muted-text">{testMode === 'MOCK' ? `No manual ${mockExamType} mock question bank exists yet. Create one by hand first.` : 'No question banks yet — import a DOCX or create one first.'}</p>
            )}
          </div>
        ) : null}

        {step === 'questions' ? (
          <div className="stack">
            <p className="muted-text">
              Check the questions to offer in this test. Fix any missing correct answers and approve pending ones right here.
            </p>
            {loadingQuestions ? <p className="muted-text">Loading questions…</p> : null}
            <GroupedQuestionPicker
              onQuickAnswer={(question, value) => void quickSetAnswer(question, value)}
              onToggleApproval={(groupQuestions) => void toggleGroupApproval(groupQuestions)}
              onToggleGroup={toggleGroupSelection}
              onToggleQuestion={toggleQuestion}
              questions={bankQuestions}
              selectedIds={selectedQuestionIds}
            />
            <span className="muted-text">{selectedGroupCount} of {bankGroups.length} question sets selected</span>
            {testMode === 'MOCK' ? (
              <div className="wizard-summary">
                {mockTemplate.sections.map((section) => <div key={section.name}><strong>{section.name}</strong>: {mockSectionCounts[section.name] || 0} / {section.questions} questions · {section.minutes} min{mockTemplate.sectionTimed ? ' section timer' : ''}</div>)}
              </div>
            ) : null}
          </div>
        ) : null}

        {step === 'threshold' ? (
          <div className="stack">
            <p className="muted-text">
              You selected {selectedGroupCount} question set{selectedGroupCount === 1 ? '' : 's'} (a passage and its sub-questions
              count as one set). Set exactly how many of them each student must pick — not fewer, not more.
            </p>
            <label>
              <span>Question sets each student must select</span>
              <input
                max={selectedGroupCount}
                min={1}
                onChange={(event) => setThresholdCount(Number(event.target.value))}
                type="number"
                value={thresholdCount}
              />
            </label>
          </div>
        ) : null}

        {step === 'reading' && testMode === 'SECTIONAL' ? (
          <div className="stack">
            <p className="muted-text">
              How long can students skim the {selectedGroupCount} offered question set{selectedGroupCount === 1 ? '' : 's'} before locking in their {thresholdCount} picks?
            </p>
            <label>
              <span>Reading minutes</span>
              <input min={1} onChange={(event) => setReadingMinutes(Number(event.target.value))} type="number" value={readingMinutes} />
            </label>
          </div>
        ) : null}

        {step === 'answering' ? (
          <div className="stack">
            <p className="muted-text">How long do students get to answer their {thresholdCount} chosen question(s)?</p>
            <label>
              <span>Answer minutes</span>
              <input min={1} onChange={(event) => setAnswerMinutes(Number(event.target.value))} type="number" value={answerMinutes} />
            </label>
          </div>
        ) : null}

        {step === 'review' ? (
          <div className="stack">
            <dl className="wizard-summary">
              <dt>Title</dt><dd>{title}</dd>
              <dt>Question bank</dt><dd>{selectedBankName}</dd>
              <dt>Test type</dt><dd>{testMode === 'MOCK' ? `${mockTemplate.label} mock test` : 'Sectional test'}</dd>
              <dt>Question sets offered</dt><dd>{selectedGroupCount}</dd>
              <dt>Each student answers</dt><dd>{testMode === 'MOCK' ? 'All questions' : thresholdCount}</dd>
              {testMode === 'SECTIONAL' ? <><dt>Reading time</dt><dd>{readingMinutes} min</dd></> : null}
              <dt>Answer time</dt><dd>{testMode === 'MOCK' ? `${mockTemplate.totalMinutes} min` : `${answerMinutes} min`}</dd>
              <dt>Scheduled start</dt><dd>{scheduledStartAt ? new Date(scheduledStartAt).toLocaleString() : '—'}</dd>
              <dt>Scheduled end</dt><dd>{scheduledEndAt ? new Date(scheduledEndAt).toLocaleString() : '—'}</dd>
            </dl>
            <button className="primary-button" disabled={submitting} onClick={() => void publishNewTest()} type="button">
              {submitting ? 'Publishing…' : 'Publish test'}
            </button>
          </div>
        ) : null}

        <div className="toolbar">
          <button className="ghost-button" disabled={step === 'details'} onClick={goBack} type="button">
            <ChevronLeft size={16} /> Back
          </button>
          {step !== 'review' ? (
            <button className="primary-button" onClick={goNext} type="button">
              Next <ChevronRight size={16} />
            </button>
          ) : null}
        </div>
      </section>

      <section className="card stack">
        <div className="admin-section-heading"><div><span className="eyebrow">Your library</span><h2>Existing tests</h2><p>Find, review, and manage published tests.</p></div><span className="admin-section-count">{tests.length} total</span></div>
        <div className="admin-list-toolbar admin-list-toolbar--inside">
          <label className="admin-search-field"><Search size={16} /><span className="sr-only">Search tests</span><input onChange={(event) => { setTestSearch(event.target.value); setTestPage(1); }} placeholder="Search tests" value={testSearch} /></label>
          <label className="admin-filter-field"><span className="sr-only">Filter tests by status</span><select onChange={(event) => { setTestStatus(event.target.value); setTestPage(1); }} value={testStatus}><option value="ALL">All statuses</option><option value="DRAFT">Draft</option><option value="PUBLISHED">Published</option><option value="CLOSED">Closed</option><option value="ARCHIVED">Archived</option></select></label>
        </div>
        {filteredTests.length ? (
          <div className="stack">
            {visibleTests.map((test) => {
              const expanded = expandedTestId === test.id;
              return (
                <article className="test-manage-card" key={test.id}>
                  <div className="test-row">
                    <div>
                      <h3>{test.title}</h3>
                      <small>{test.mode === 'MOCK' ? `${test.mockExamType} mock` : `threshold ${test.thresholdCount} · read ${Math.floor(test.readingDurationSec / 60)}m`} &middot; answer {Math.floor(test.answerDurationSec / 60)}m &middot; {test.questions?.length || 0} questions attached</small>
                    </div>
                    <div className="toolbar">
                      <Badge value={test.status} />
                      <button className="ghost-button" onClick={() => toggleExpand(test)} type="button">
                        {expanded ? 'Close' : 'Manage questions'}
                      </button>
                      <button className="primary-button" disabled={test.status !== 'DRAFT'} onClick={() => void publishExisting(test.id)} type="button">
                        {test.status === 'DRAFT' ? 'Publish' : test.status === 'PUBLISHED' ? 'Published' : test.status === 'CLOSED' ? 'Closed' : 'Archived'}
                      </button>
                    </div>
                  </div>

                  {expanded ? (
                    <div className="test-manage-card__panel stack">
                      <input onChange={(event) => setManageSearch(event.target.value)} placeholder="Search questions by text or topic" value={manageSearch} />
                      <GroupedQuestionPicker
                        onQuickAnswer={(question, value) => void quickSetManageAnswer(question, value)}
                        onToggleApproval={(groupQuestions) => void toggleManageGroupApproval(groupQuestions)}
                        onToggleGroup={toggleManageGroupSelection}
                        onToggleQuestion={toggleManageQuestion}
                        questions={filteredAllQuestions}
                        selectedIds={expandedSelection}
                      />
                      <div className="toolbar">
                        <span className="muted-text">{expandedSelection.length} question(s) selected</span>
                        <button className="primary-button" onClick={() => void saveTestQuestions(test.id)} type="button">Save questions</button>
                      </div>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        ) : (
          <p className="muted-text">{tests.length ? 'No tests match these filters.' : 'No tests yet. Use the steps above to publish your first one.'}</p>
        )}
        {testPageCount > 1 ? <div className="admin-pagination"><span>Showing {(currentTestPage - 1) * testPageSize + 1}–{Math.min(currentTestPage * testPageSize, filteredTests.length)} of {filteredTests.length}</span><div><button aria-label="Previous page" disabled={currentTestPage === 1} onClick={() => setTestPage(currentTestPage - 1)} type="button"><ChevronLeft size={16} /></button><span>Page {currentTestPage} of {testPageCount}</span><button aria-label="Next page" disabled={currentTestPage === testPageCount} onClick={() => setTestPage(currentTestPage + 1)} type="button"><ChevronRight size={16} /></button></div></div> : null}
      </section>
    </div>
  );
}
