import type {
  Question,
  QuestionContentBlock,
  QuestionOption,
  StudentAnswer,
  StudentQuestionSelection,
  StudentTestSession,
  Test,
  TestQuestion,
} from '@prisma/client';

type QuestionWithRelations = Question & {
  contentBlocks: QuestionContentBlock[];
  options: QuestionOption[];
};

type TestWithQuestions = Test & {
  testQuestions: (TestQuestion & {
    question: QuestionWithRelations;
  })[];
};

type SessionWithRelations = StudentTestSession & {
  selections: StudentQuestionSelection[];
  answers: StudentAnswer[];
  test: Test;
};

export function serializeQuestion(question: QuestionWithRelations, options: { includeAnswerKey?: boolean } = {}) {
  const { includeAnswerKey = true } = options;
  const extracted = question.originalPayload && typeof question.originalPayload === 'object'
    ? (question.originalPayload as { extracted?: { actual_number?: string; question_number?: string }; rowIndex?: number }).extracted
    : undefined;

  return {
    id: question.id,
    sourceType: question.sourceType,
    questionNumber: extracted?.actual_number || extracted?.question_number || null,
    paragraph: question.paragraph,
    questionText: question.questionText,
    textBeforeImage: question.textBeforeImage,
    textAfterImage: question.textAfterImage,
    imagePath: question.imagePath,
    topic: question.topic,
    answerType: question.answerType,
    correctOptionKey: includeAnswerKey ? question.correctOptionKey : null,
    correctTextAnswer: includeAnswerKey ? question.correctTextAnswer : null,
    verificationStatus: question.verificationStatus,
    finalApproved: question.finalApproved,
    options: question.options
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((option) => ({
        id: option.id,
        key: option.optionKey,
        content: option.content,
      })),
    contentBlocks: question.contentBlocks
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((block) => ({
        id: block.id,
        blockType: block.blockType,
        textContent: block.textContent,
        imagePath: block.imagePath,
      })),
  };
}

export function serializeTest(test: TestWithQuestions) {
  return {
    id: test.id,
    title: test.title,
    description: test.description,
    mode: test.mode,
    mockExamType: test.mockExamType,
    mockStructure: test.mockStructure,
    scheduledStartAt: test.scheduledStartAt,
    scheduledEndAt: test.scheduledEndAt,
    status: test.status,
    readingDurationSec: test.readingDurationSec,
    answerDurationSec: test.answerDurationSec,
    thresholdCount: test.thresholdCount,
    allowAboveThreshold: test.allowAboveThreshold,
    maxSelectableCount: test.maxSelectableCount,
    questionOrderMode: test.questionOrderMode,
    optionOrderMode: test.optionOrderMode,
    resultVisibility: test.resultVisibility,
    publishedAt: test.publishedAt,
    questions: test.testQuestions
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((item) => ({
        id: item.id,
        sortOrder: item.sortOrder,
        isActive: item.isActive,
        question: serializeQuestion(item.question),
      })),
  };
}

export function serializeSession(session: SessionWithRelations) {
  return {
    id: session.id,
    status: session.status,
    startedAt: session.startedAt,
    readingStartedAt: session.readingStartedAt,
    readingEndsAt: session.readingEndsAt,
    selectionLockedAt: session.selectionLockedAt,
    answerStartedAt: session.answerStartedAt,
    answerEndsAt: session.answerEndsAt,
    submittedAt: session.submittedAt,
    autoSubmitted: session.autoSubmitted,
    totalSelectedCount: session.totalSelectedCount,
    totalAnsweredCount: session.totalAnsweredCount,
    correctCount: session.correctCount,
    wrongCount: session.wrongCount,
    scorePercent: session.scorePercent,
    rating: session.rating,
    studentReview: session.studentReview,
    feedbackSubmittedAt: session.feedbackSubmittedAt,
    selections: session.selections.map((selection) => selection.questionId),
    answers: session.answers.map((answer) => ({
      questionId: answer.questionId,
      selectedOptionKey: answer.selectedOptionKey,
      isCorrect: answer.isCorrect,
      answeredAt: answer.answeredAt,
    })),
    test: {
      id: session.test.id,
      title: session.test.title,
      mode: session.test.mode,
      mockExamType: session.test.mockExamType,
      mockStructure: session.test.mockStructure,
      thresholdCount: session.test.thresholdCount,
      readingDurationSec: session.test.readingDurationSec,
      answerDurationSec: session.test.answerDurationSec,
      allowAboveThreshold: session.test.allowAboveThreshold,
      maxSelectableCount: session.test.maxSelectableCount,
      resultVisibility: session.test.resultVisibility,
    },
  };
}
