export type UserRole = 'ADMIN' | 'STUDENT';

export type Avatar = {
  id: string;
  name: string;
  imageUrl: string;
  accentColor: string;
};

export type User = {
  id: string;
  name: string;
  role: UserRole;
  course?: string | null;
  mobileNumber?: string | null;
  avatar?: Avatar | null;
  onboardingSeenAt?: string | null;
};

export type StudentSummary = {
  id: string;
  name: string;
  course?: string | null;
  mobileNumber?: string | null;
  isBlocked: boolean;
  avatar?: Avatar | null;
  sessionCount: number;
  createdAt: string;
};

export type StudentHistoryEntry = {
  id: string;
  test: { id: string; title: string; mode: 'SECTIONAL' | 'MOCK' };
  status: 'NOT_STARTED' | 'WAITING' | 'READING' | 'ANSWERING' | 'SUBMITTED' | 'AUTO_SUBMITTED' | 'EXPIRED';
  startedAt?: string | null;
  submittedAt?: string | null;
  selectedCount: number;
  answeredCount: number;
  correctCount: number;
  wrongCount: number;
  scorePercent: number;
  totalAnswerTimeSec: number;
  rating?: number | null;
  review?: string | null;
};

export type QuestionOption = {
  id?: string;
  key: string;
  content: string;
};

export type QuestionBlock = {
  id?: string;
  blockType: 'TEXT' | 'IMAGE';
  textContent?: string | null;
  imagePath?: string | null;
};

export type Question = {
  id: string;
  sourceType: 'IMPORTED' | 'MANUAL';
  questionNumber?: string | null;
  paragraph?: string | null;
  questionText: string;
  textBeforeImage?: string | null;
  textAfterImage?: string | null;
  imagePath?: string | null;
  topic?: string | null;
  answerType: 'OPTIONS' | 'TEXT';
  correctOptionKey?: string | null;
  correctTextAnswer?: string | null;
  verificationStatus: 'PENDING' | 'CORRECT' | 'NEEDS_EDIT' | 'INVALID' | 'APPROVED';
  finalApproved: boolean;
  options: QuestionOption[];
  contentBlocks: QuestionBlock[];
};

export type BankSummary = {
  id: string;
  name: string;
  type: 'IMPORTED' | 'MANUAL';
  mockExamType?: 'CAT' | 'IPMAT' | 'IPMAT_INDORE' | 'IPMAT_ROHTAK' | null;
  questionCount: number;
  createdAt: string;
};

export type LobbyStudent = {
  id: string;
  name: string;
  avatarUrl: string | null;
};

export type LobbyState = {
  unlocked: boolean;
  ended?: boolean;
  waitingStudents: LobbyStudent[];
};

export type DetailedAnswerRow = {
  studentId: string;
  studentName: string;
  questionId: string;
  questionNumber?: string | null;
  questionText: string;
  selectedAnswer: string | null;
  correctAnswer: string | null;
  result: 'CORRECT' | 'WRONG' | 'NOT_ANSWERED';
  timeTakenSec: number | null;
};

export type ExtractionIssue = {
  section: string;
  question_number: string | null;
  question_index: number | null;
  issue_type: string;
  detected_value: string;
  suggested_fix: string;
};

export type Test = {
  id: string;
  title: string;
  description?: string | null;
  mode: 'SECTIONAL' | 'MOCK';
  mockExamType?: 'CAT' | 'IPMAT' | 'IPMAT_INDORE' | 'IPMAT_ROHTAK' | null;
  mockStructure?: { label: string; totalMinutes: number; sectionTimed: boolean; sections: Array<{ name: string; questions: number; minutes: number }> } | null;
  scheduledStartAt: string;
  scheduledEndAt: string;
  status: 'DRAFT' | 'PUBLISHED' | 'CLOSED' | 'ARCHIVED';
  readingDurationSec: number;
  answerDurationSec: number;
  thresholdCount: number;
  allowAboveThreshold: boolean;
  maxSelectableCount?: number | null;
  questionOrderMode: 'FIXED' | 'SHUFFLED';
  optionOrderMode: 'FIXED' | 'SHUFFLED';
  resultVisibility: 'HIDDEN' | 'AFTER_SUBMISSION' | 'AFTER_TEST_END';
  publishedAt?: string | null;
  questions?: Array<{
    id: string;
    sortOrder: number;
    isActive: boolean;
    question: Question;
  }>;
  questionCount?: number;
};

export type HistoryEntry = {
  sessionId: string;
  testId: string;
  testTitle: string;
  status: 'NOT_STARTED' | 'WAITING' | 'READING' | 'ANSWERING' | 'SUBMITTED' | 'AUTO_SUBMITTED' | 'EXPIRED';
  totalSelectedCount: number;
  totalAnsweredCount: number;
  correctCount: number;
  wrongCount: number;
  scorePercent: number;
  submittedAt?: string | null;
  startedAt?: string | null;
};

export type TestSession = {
  id: string;
  status: 'NOT_STARTED' | 'WAITING' | 'READING' | 'ANSWERING' | 'SUBMITTED' | 'AUTO_SUBMITTED' | 'EXPIRED';
  startedAt?: string | null;
  readingStartedAt?: string | null;
  readingEndsAt?: string | null;
  selectionLockedAt?: string | null;
  answerStartedAt?: string | null;
  answerEndsAt?: string | null;
  submittedAt?: string | null;
  autoSubmitted: boolean;
  totalSelectedCount: number;
  totalAnsweredCount: number;
  correctCount: number;
  wrongCount: number;
  scorePercent: number;
  rating?: number | null;
  studentReview?: string | null;
  feedbackSubmittedAt?: string | null;
  selections: string[];
  answers: Array<{
    questionId: string;
    selectedOptionKey: string;
    isCorrect: boolean;
    answeredAt: string;
  }>;
  test: {
    id: string;
    title: string;
    mode: 'SECTIONAL' | 'MOCK';
    mockExamType?: 'CAT' | 'IPMAT' | 'IPMAT_INDORE' | 'IPMAT_ROHTAK' | null;
    mockStructure?: Test['mockStructure'];
    thresholdCount: number;
    readingDurationSec: number;
    answerDurationSec: number;
    allowAboveThreshold: boolean;
    maxSelectableCount?: number | null;
    resultVisibility: 'HIDDEN' | 'AFTER_SUBMISSION' | 'AFTER_TEST_END';
  };
};

export type ReviewRatingEntry = {
  id: string;
  rating: number | null;
  review: string | null;
  submittedAt: string;
  student: {
    id: string;
    name: string;
    course?: string | null;
    avatar?: Avatar | null;
  };
  test: {
    id: string;
    title: string;
  };
};
