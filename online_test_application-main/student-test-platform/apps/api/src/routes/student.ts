// @ts-nocheck
import { Router } from 'express';
import { SessionStatus, TestStatus, UserRole } from '@prisma/client';
import { z } from 'zod';
import { hashPassword, verifyPassword } from '../lib/auth.js';
import { prisma } from '../lib/prisma.js';
import { requireRole } from '../middleware/auth.js';
import {
  buildSessionQuestionOrder,
  finalizeSubmission,
  normalizeAnswerText,
  refreshSessionState,
  shuffleOptions,
  startSession,
  transitionToAnswering,
} from '../services/test-session-service.js';
import { serializeQuestion, serializeSession } from '../utils/serializers.js';
import { asyncHandler } from '../utils/async-handler.js';
import { countSelectedGroups, findPartiallySelectedGroup } from '../utils/question-groups.js';

const studentOnly = requireRole(UserRole.STUDENT);

function activeMockSubject(test: { mode: string; mockStructure?: unknown }, answerStartedAt?: Date | null) {
  if (test.mode !== 'MOCK' || !answerStartedAt || !test.mockStructure || typeof test.mockStructure !== 'object') return null;
  const structure = test.mockStructure as { sectionTimed?: boolean; sections?: Array<{ name: string; minutes: number }> };
  if (!structure.sectionTimed || !structure.sections?.length) return null;
  const elapsedSeconds = Math.max(0, Math.floor((Date.now() - answerStartedAt.getTime()) / 1000));
  let boundary = 0;
  for (const section of structure.sections) {
    boundary += section.minutes * 60;
    if (elapsedSeconds < boundary) return section.name;
  }
  return null;
}

export const studentRouter = Router();
studentRouter.use(studentOnly);

studentRouter.get('/tests', asyncHandler(async (req, res) => {
  const tests = await prisma.test.findMany({
    where: { status: TestStatus.PUBLISHED },
    include: {
      testQuestions: true,
      sessions: {
        where: { studentId: req.auth!.userId },
        select: { status: true },
      },
    },
    orderBy: { scheduledStartAt: 'asc' },
  });
  res.json({
    tests: tests
      .filter((test) => !test.sessions.some((session) => (
        session.status === SessionStatus.SUBMITTED
        || session.status === SessionStatus.AUTO_SUBMITTED
      )))
      .map((test) => ({
        id: test.id,
        title: test.title,
        description: test.description,
        mode: test.mode,
        mockExamType: test.mockExamType,
        mockStructure: test.mockStructure,
        scheduledStartAt: test.scheduledStartAt,
        scheduledEndAt: test.scheduledEndAt,
        status: test.status,
        thresholdCount: test.thresholdCount,
        readingDurationSec: test.readingDurationSec,
        answerDurationSec: test.answerDurationSec,
        questionCount: test.testQuestions.length,
      })),
  });
}));

studentRouter.get('/tests/:testId/waiting-room', asyncHandler(async (req, res) => {
  const test = await prisma.test.findUnique({ where: { id: req.params.testId } });
  if (!test || test.status !== TestStatus.PUBLISHED) {
    return res.status(404).json({ message: 'Test not available' });
  }
  const waitingSessions = await prisma.studentTestSession.findMany({
    where: { testId: test.id, status: SessionStatus.WAITING },
    include: { student: { include: { avatar: true } } },
    orderBy: { createdAt: 'asc' },
  });
  res.json({
    unlocked: Boolean(test.lobbyUnlockedAt),
    waitingStudents: waitingSessions.map((session) => ({
      id: session.student.id,
      name: session.student.name,
      avatarUrl: session.student.avatar?.imageUrl || null,
    })),
  });
}));

studentRouter.post('/tests/:testId/start', asyncHandler(async (req, res) => {
  const test = await prisma.test.findUnique({ where: { id: req.params.testId } });
  if (!test || test.status !== TestStatus.PUBLISHED) {
    return res.status(404).json({ message: 'Test not available' });
  }
  let session;
  try {
    session = await startSession(req.auth!.userId, test);
  } catch (error) {
    if (error instanceof Error && (
      error.message.includes('already completed')
      || error.message.includes('no longer available')
    )) {
      return res.status(409).json({ message: error.message });
    }
    throw error;
  }
  const hydrated = await prisma.studentTestSession.findUniqueOrThrow({
    where: { id: session.id },
    include: {
      selections: true,
      answers: true,
      test: true,
    },
  });
  res.json({ session: serializeSession(hydrated) });
}));

studentRouter.get('/sessions/:sessionId', asyncHandler(async (req, res) => {
  const session = await refreshSessionState(req.params.sessionId);
  const hydrated = await prisma.studentTestSession.findUniqueOrThrow({
    where: { id: session.id },
    include: {
      selections: true,
      answers: true,
      test: true,
    },
  });
  res.json({ session: serializeSession(hydrated) });
}));

studentRouter.get('/sessions/:sessionId/reading-questions', asyncHandler(async (req, res) => {
  const session = await prisma.studentTestSession.findUnique({
    where: { id: req.params.sessionId },
    include: {
      test: {
        include: {
          testQuestions: {
            include: {
              question: {
                include: {
                  options: true,
                  contentBlocks: true,
                },
              },
            },
          },
        },
      },
      selections: true,
    },
  });
  if (!session || session.studentId !== req.auth!.userId) {
    return res.status(404).json({ message: 'Session not found' });
  }
  const ordered = buildSessionQuestionOrder(session.test.testQuestions, session.test.questionOrderMode);
  res.json({
    selectedQuestionIds: session.selections.map((selection) => selection.questionId),
    questions: ordered.map((item) => serializeQuestion(item.question, { includeAnswerKey: false })),
  });
}));

studentRouter.post('/sessions/:sessionId/selections', asyncHandler(async (req, res) => {
  const payload = z.object({
    questionIds: z.array(z.string()),
  }).parse(req.body);

  const session = await prisma.studentTestSession.findUnique({
    where: { id: req.params.sessionId },
    include: {
      test: {
        include: {
          testQuestions: { include: { question: { select: { id: true, paragraph: true, imagePath: true } } } },
        },
      },
    },
  });
  if (!session || session.studentId !== req.auth!.userId) {
    return res.status(404).json({ message: 'Session not found' });
  }

  const refreshed = await refreshSessionState(session.id);
  if (refreshed.status !== SessionStatus.READING) {
    return res.status(400).json({ message: 'Reading phase is locked' });
  }

  const allQuestions = session.test.testQuestions.map((item) => item.question);
  if (findPartiallySelectedGroup(allQuestions, payload.questionIds)) {
    return res.status(400).json({ message: 'Select every question in a shared passage together' });
  }

  // Intermediate saves are allowed to be under (or, if the test permits it,
  // over) the threshold — a student builds up their selection one set at a
  // time, and rejecting every save that isn't yet exactly at the threshold
  // would make it impossible to ever reach it. The exact/at-least check
  // happens once, when the student actually locks in and moves on (see
  // transitionToAnswering). Only the upper bound is enforced here, since a
  // cap never blocks incremental progress toward it.
  const selectedGroupCount = countSelectedGroups(allQuestions, payload.questionIds);
  const cap = session.test.allowAboveThreshold ? session.test.maxSelectableCount : session.test.thresholdCount;
  if (cap && selectedGroupCount > cap) {
    return res.status(400).json({ message: 'Selection exceeds the maximum allowed' });
  }

  await prisma.studentQuestionSelection.deleteMany({
    where: { sessionId: session.id },
  });
  if (payload.questionIds.length) {
    await prisma.studentQuestionSelection.createMany({
      data: payload.questionIds.map((questionId) => ({
        sessionId: session.id,
        questionId,
      })),
    });
  }
  const updated = await prisma.studentTestSession.update({
    where: { id: session.id },
    data: { totalSelectedCount: payload.questionIds.length },
    include: {
      selections: true,
      answers: true,
      test: true,
    },
  });
  res.json({ session: serializeSession(updated) });
}));

studentRouter.post('/sessions/:sessionId/lock-reading', asyncHandler(async (req, res) => {
  const session = await prisma.studentTestSession.findUnique({
    where: { id: req.params.sessionId },
    include: { test: true },
  });
  if (!session || session.studentId !== req.auth!.userId) {
    return res.status(404).json({ message: 'Session not found' });
  }
  const updated = await transitionToAnswering(session.id, session.test);
  const hydrated = await prisma.studentTestSession.findUniqueOrThrow({
    where: { id: updated.id },
    include: { selections: true, answers: true, test: true },
  });
  res.json({ session: serializeSession(hydrated) });
}));

studentRouter.get('/sessions/:sessionId/answer-questions', asyncHandler(async (req, res) => {
  await refreshSessionState(req.params.sessionId);
  const session = await prisma.studentTestSession.findUnique({
    where: { id: req.params.sessionId },
    include: {
      test: {
        include: {
          testQuestions: {
            include: {
              question: {
                include: {
                  options: true,
                  contentBlocks: true,
                },
              },
            },
          },
        },
      },
      selections: true,
      answers: true,
    },
  });
  if (!session || session.studentId !== req.auth!.userId) {
    return res.status(404).json({ message: 'Session not found' });
  }
  if (![SessionStatus.ANSWERING, SessionStatus.SUBMITTED, SessionStatus.AUTO_SUBMITTED].includes(session.status)) {
    return res.status(400).json({ message: 'Answer phase is not active' });
  }

  const selected = new Set(session.selections.map((selection) => selection.questionId));
  const activeSubject = activeMockSubject(session.test, session.answerStartedAt);
  const questions = buildSessionQuestionOrder(session.test.testQuestions, session.test.questionOrderMode)
    .filter((item) => selected.has(item.questionId) && (!activeSubject || item.question.topic === activeSubject))
    .map((item) => ({
      ...serializeQuestion({
        ...item.question,
        options: shuffleOptions(item.question.options, session.id, session.test.optionOrderMode),
      }, { includeAnswerKey: false }),
      answer: session.answers.find((answer) => answer.questionId === item.questionId)?.selectedOptionKey || null,
    }));

  res.json({ questions });
}));

studentRouter.post('/sessions/:sessionId/answers', asyncHandler(async (req, res) => {
  const payload = z.object({
    questionId: z.string(),
    selectedOptionKey: z.string(),
  }).parse(req.body);

  const session = await prisma.studentTestSession.findUnique({
    where: { id: req.params.sessionId },
    include: { test: true, selections: true },
  });
  if (!session || session.studentId !== req.auth!.userId) {
    return res.status(404).json({ message: 'Session not found' });
  }
  const refreshed = await refreshSessionState(session.id);
  if (refreshed.status !== SessionStatus.ANSWERING) {
    return res.status(400).json({ message: 'Answer phase is not active' });
  }

  const allowed = session.selections.some((selection) => selection.questionId === payload.questionId);
  if (!allowed) {
    return res.status(400).json({ message: 'Question was not selected during reading phase' });
  }

  const question = await prisma.question.findUnique({
    where: { id: payload.questionId },
  });
  if (!question) {
    return res.status(404).json({ message: 'Question not found' });
  }
  const activeSubject = activeMockSubject(session.test, session.answerStartedAt);
  if (activeSubject && question.topic !== activeSubject) {
    return res.status(400).json({ message: `The ${activeSubject} section is currently active.` });
  }

  const isCorrect = question.answerType === 'TEXT'
    ? normalizeAnswerText(payload.selectedOptionKey) === normalizeAnswerText(question.correctTextAnswer || '')
    : question.correctOptionKey === payload.selectedOptionKey;

  await prisma.studentAnswer.upsert({
    where: {
      sessionId_questionId: {
        sessionId: session.id,
        questionId: payload.questionId,
      },
    },
    update: {
      selectedOptionKey: payload.selectedOptionKey,
      isCorrect,
      answeredAt: new Date(),
    },
    create: {
      sessionId: session.id,
      questionId: payload.questionId,
      selectedOptionKey: payload.selectedOptionKey,
      isCorrect,
    },
  });

  const answers = await prisma.studentAnswer.findMany({ where: { sessionId: session.id } });
  const correctCount = answers.filter((item) => item.isCorrect).length;
  const wrongCount = answers.length - correctCount;
  await prisma.studentTestSession.update({
    where: { id: session.id },
    data: {
      totalAnsweredCount: answers.length,
      correctCount,
      wrongCount,
      scorePercent: session.selections.length ? (correctCount / session.selections.length) * 100 : 0,
      totalAnswerTimeSec: Math.max(
        0,
        Math.floor((Date.now() - (session.answerStartedAt?.getTime() || Date.now())) / 1000),
      ),
    },
  });

  res.json({ ok: true });
}));

studentRouter.post('/sessions/:sessionId/submit', asyncHandler(async (req, res) => {
  const session = await prisma.studentTestSession.findUnique({
    where: { id: req.params.sessionId },
  });
  if (!session || session.studentId !== req.auth!.userId) {
    return res.status(404).json({ message: 'Session not found' });
  }
  const submitted = await finalizeSubmission(session.id, false);
  const hydrated = await prisma.studentTestSession.findUniqueOrThrow({
    where: { id: submitted.id },
    include: { selections: true, answers: true, test: true },
  });
  res.json({ session: serializeSession(hydrated) });
}));

studentRouter.put('/sessions/:sessionId/feedback', asyncHandler(async (req, res) => {
  const payload = z.object({
    rating: z.number().int().min(1).max(5),
    review: z.string().trim().min(3).max(2000),
  }).parse(req.body);

  const session = await prisma.studentTestSession.findUnique({
    where: { id: req.params.sessionId },
  });
  if (!session || session.studentId !== req.auth!.userId) {
    return res.status(404).json({ message: 'Session not found' });
  }
  if (![SessionStatus.SUBMITTED, SessionStatus.AUTO_SUBMITTED].includes(session.status)) {
    return res.status(400).json({ message: 'Feedback is only available after the test is submitted' });
  }
  if (session.feedbackSubmittedAt || session.studentReview) {
    return res.status(409).json({ message: 'Rating and review have already been submitted for this test' });
  }

  const result = await prisma.studentTestSession.updateMany({
    where: {
      id: session.id,
      feedbackSubmittedAt: null,
      studentReview: null,
    },
    data: {
      rating: payload.rating,
      studentReview: payload.review,
      feedbackSubmittedAt: new Date(),
    },
  });
  if (!result.count) {
    return res.status(409).json({ message: 'Rating and review have already been submitted for this test' });
  }
  const updated = await prisma.studentTestSession.findUniqueOrThrow({ where: { id: session.id } });
  res.json({
    rating: updated.rating,
    review: updated.studentReview,
    feedbackSubmittedAt: updated.feedbackSubmittedAt,
  });
}));

studentRouter.put('/profile/avatar', asyncHandler(async (req, res) => {
  const payload = z.object({ avatarId: z.string() }).parse(req.body);
  const avatar = await prisma.avatar.findUnique({ where: { id: payload.avatarId } });
  if (!avatar) {
    return res.status(404).json({ message: 'Avatar not found' });
  }
  const user = await prisma.user.update({
    where: { id: req.auth!.userId },
    data: { avatarId: payload.avatarId },
    include: { avatar: true },
  });
  res.json({ user: { id: user.id, name: user.name, role: user.role, avatar: user.avatar } });
}));

studentRouter.put('/profile/password', asyncHandler(async (req, res) => {
  const payload = z.object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(4),
  }).parse(req.body);

  const user = await prisma.user.findUnique({ where: { id: req.auth!.userId } });
  if (!user) {
    return res.status(404).json({ message: 'User not found' });
  }
  const valid = await verifyPassword(payload.currentPassword, user.passwordHash);
  if (!valid) {
    return res.status(400).json({ message: 'Current password is incorrect' });
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(payload.newPassword) },
  });
  res.json({ ok: true });
}));

studentRouter.get('/history', asyncHandler(async (req, res) => {
  const sessions = await prisma.studentTestSession.findMany({
    where: { studentId: req.auth!.userId },
    include: { test: true },
    orderBy: { createdAt: 'desc' },
  });
  res.json({
    history: sessions.map((session) => ({
      sessionId: session.id,
      testId: session.testId,
      testTitle: session.test.title,
      status: session.status,
      totalSelectedCount: session.totalSelectedCount,
      totalAnsweredCount: session.totalAnsweredCount,
      correctCount: session.correctCount,
      wrongCount: session.wrongCount,
      scorePercent: session.scorePercent,
      submittedAt: session.submittedAt,
      startedAt: session.startedAt,
    })),
  });
}));

studentRouter.get('/sessions/:sessionId/result', asyncHandler(async (req, res) => {
  const session = await prisma.studentTestSession.findUnique({
    where: { id: req.params.sessionId },
    include: {
      test: true,
      selections: true,
      answers: true,
      resultSummary: true,
    },
  });
  if (!session || session.studentId !== req.auth!.userId) {
    return res.status(404).json({ message: 'Session not found' });
  }
  if (session.test.resultVisibility === 'HIDDEN') {
    return res.status(403).json({ message: 'Results are hidden for this test' });
  }
  res.json({
    session: serializeSession(session),
    summary: session.resultSummary,
  });
}));
