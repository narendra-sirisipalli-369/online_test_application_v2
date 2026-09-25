import { SessionStatus, TestStatus, type Prisma, type StudentTestSession, type Test } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { countSelectedGroups, groupQuestionIds } from '../utils/question-groups.js';

const SECOND = 1000;

function addSeconds(date: Date, seconds: number) {
  return new Date(date.getTime() + seconds * SECOND);
}

async function getMockSelectionData(testId: string) {
  const questions = await prisma.testQuestion.findMany({ where: { testId }, select: { questionId: true } });
  return questions.map((item) => ({ questionId: item.questionId }));
}

export function getPhase(session: StudentTestSession, now = new Date()) {
  if (session.status === SessionStatus.SUBMITTED || session.status === SessionStatus.AUTO_SUBMITTED) {
    return 'submitted';
  }

  if (session.answerEndsAt && now > session.answerEndsAt) {
    return 'answer-expired';
  }

  if (session.answerStartedAt) {
    return 'answering';
  }

  if (session.readingEndsAt && now > session.readingEndsAt) {
    return 'reading-expired';
  }

  if (session.readingStartedAt) {
    return 'reading';
  }

  return 'not-started';
}

// Before the teacher unlocks a test, joining puts a student in the shared
// waiting room (WAITING) instead of starting their own reading timer, so the
// whole class can begin reading at exactly the same moment. Once a test has
// been unlocked at least once, later joiners just start immediately — they
// missed the synchronized moment, so there's nothing left to wait for.
export async function startSession(studentId: string, test: Test) {
  const now = new Date();
  const currentTest = await prisma.test.findUnique({ where: { id: test.id }, select: { status: true } });
  if (!currentTest || currentTest.status !== TestStatus.PUBLISHED) {
    throw new Error('This test has ended and is no longer available.');
  }
  const existingSession = await prisma.studentTestSession.findUnique({
    where: {
      testId_studentId: {
        testId: test.id,
        studentId,
      },
    },
  });

  if (existingSession) {
    if (
      existingSession.status === SessionStatus.SUBMITTED
      || existingSession.status === SessionStatus.AUTO_SUBMITTED
    ) {
      throw new Error('You have already completed this test. A second attempt is not allowed.');
    }

    if (existingSession.status === SessionStatus.WAITING) {
      return existingSession;
    }

    if (
      existingSession.status === SessionStatus.READING
      || existingSession.status === SessionStatus.ANSWERING
    ) {
      return refreshSessionState(existingSession.id);
    }
  }

  if (!test.lobbyUnlockedAt) {
    return prisma.studentTestSession.create({
      data: {
        studentId,
        testId: test.id,
        status: SessionStatus.WAITING,
      },
    });
  }

  if (test.mode === 'MOCK') {
    const selections = await getMockSelectionData(test.id);
    return prisma.studentTestSession.create({
      data: {
        studentId,
        testId: test.id,
        startedAt: now,
        selectionLockedAt: now,
        answerStartedAt: now,
        answerEndsAt: addSeconds(now, test.answerDurationSec),
        status: SessionStatus.ANSWERING,
        totalSelectedCount: selections.length,
        selections: { create: selections },
      },
    });
  }

  return prisma.studentTestSession.create({
    data: {
      studentId,
      testId: test.id,
      startedAt: now,
      readingStartedAt: now,
      readingEndsAt: addSeconds(now, test.readingDurationSec),
      status: SessionStatus.READING,
    },
  });
}

// Admin action: release every currently-waiting student into the reading
// phase at the same instant.
export async function unlockLobby(testId: string) {
  const test = await prisma.test.findUniqueOrThrow({ where: { id: testId } });
  const now = new Date();
  await prisma.test.update({ where: { id: testId }, data: { lobbyUnlockedAt: now } });
  if (test.mode === 'MOCK') {
    const waiting = await prisma.studentTestSession.findMany({ where: { testId, status: SessionStatus.WAITING }, select: { id: true } });
    const selections = await getMockSelectionData(testId);
    for (const session of waiting) {
      await prisma.studentTestSession.update({
        where: { id: session.id },
        data: {
          status: SessionStatus.ANSWERING,
          startedAt: now,
          selectionLockedAt: now,
          answerStartedAt: now,
          answerEndsAt: addSeconds(now, test.answerDurationSec),
          totalSelectedCount: selections.length,
          selections: { create: selections },
        },
      });
    }
    return prisma.test.findUniqueOrThrow({ where: { id: testId } });
  }
  await prisma.studentTestSession.updateMany({
    where: { testId, status: SessionStatus.WAITING },
    data: {
      status: SessionStatus.READING,
      startedAt: now,
      readingStartedAt: now,
      readingEndsAt: addSeconds(now, test.readingDurationSec),
    },
  });
  return prisma.test.findUniqueOrThrow({ where: { id: testId } });
}

export async function transitionToAnswering(sessionId: string, test: Test) {
  const session = await prisma.studentTestSession.findUnique({
    where: { id: sessionId },
    include: { selections: true },
  });
  if (!session) {
    throw new Error('Session not found');
  }

  // This is the one authoritative checkpoint for the threshold rule — the
  // per-selection save endpoint deliberately allows any in-progress count so
  // a student can build up their picks one set at a time.
  const testQuestions = await prisma.testQuestion.findMany({
    where: { testId: test.id },
    include: { question: { select: { id: true, paragraph: true, imagePath: true } } },
  });
  const allQuestions = testQuestions.map((item) => item.question);
  const selectedGroupCount = countSelectedGroups(allQuestions, session.selections.map((selection) => selection.questionId));

  if (!test.allowAboveThreshold && selectedGroupCount !== test.thresholdCount) {
    throw new Error('Select exactly the threshold number of questions before continuing');
  }
  if (selectedGroupCount < test.thresholdCount) {
    throw new Error('Threshold not met');
  }

  const answerStart = new Date();
  const updated = await prisma.studentTestSession.update({
    where: { id: sessionId },
    data: {
      status: SessionStatus.ANSWERING,
      selectionLockedAt: session.selectionLockedAt || answerStart,
      answerStartedAt: session.answerStartedAt || answerStart,
      answerEndsAt: session.answerEndsAt || addSeconds(answerStart, test.answerDurationSec),
    },
  });
  return updated;
}

// When the reading timer runs out before the student reaches the minimum
// selection count, pick enough of the remaining test question SETS (a shared
// passage and its sub-questions count as one set, in test order) to reach
// the threshold, so the student always proceeds to the answer phase instead
// of being stuck in an unrecoverable expired state.
async function autoFillSelections(sessionId: string, testId: string, alreadySelectedIds: string[], thresholdCount: number) {
  const testQuestions = await prisma.testQuestion.findMany({
    where: { testId },
    orderBy: { sortOrder: 'asc' },
    include: { question: { select: { id: true, paragraph: true, imagePath: true } } },
  });
  const allQuestions = testQuestions.map((item) => item.question);
  const groups = groupQuestionIds(allQuestions);

  const selectedSet = new Set(alreadySelectedIds);
  let groupCount = countSelectedGroups(allQuestions, alreadySelectedIds);
  const toAdd: string[] = [];

  for (const ids of groups) {
    if (groupCount >= thresholdCount) break;
    if (ids.some((id) => selectedSet.has(id))) continue;
    toAdd.push(...ids);
    groupCount += 1;
  }

  if (!toAdd.length) return;

  await prisma.studentQuestionSelection.createMany({
    data: toAdd.map((questionId) => ({ sessionId, questionId })),
  });
  await prisma.studentTestSession.update({
    where: { id: sessionId },
    data: { totalSelectedCount: alreadySelectedIds.length + toAdd.length },
  });
}

export async function refreshSessionState(sessionId: string) {
  const session = await prisma.studentTestSession.findUnique({
    where: { id: sessionId },
    include: {
      test: true,
      selections: true,
      answers: true,
    },
  });
  if (!session) {
    throw new Error('Session not found');
  }

  const now = new Date();

  // A closed test is authoritative. This also catches the narrow race where
  // a student session was created just as the administrator ended the test.
  if (
    session.test.status === TestStatus.CLOSED
    && session.status !== SessionStatus.SUBMITTED
    && session.status !== SessionStatus.AUTO_SUBMITTED
  ) {
    return finalizeSubmission(session.id, true);
  }

  const phase = getPhase(session, now);

  if (phase === 'reading-expired') {
    // Selection rows and selectable question sets are not interchangeable:
    // one passage set can contain several question rows. Let the helper count
    // groups every time, so an already-selected multi-question passage cannot
    // incorrectly satisfy a threshold measured in sets.
    await autoFillSelections(
      session.id,
      session.test.id,
      session.selections.map((selection) => selection.questionId),
      session.test.thresholdCount,
    );
    return transitionToAnswering(session.id, session.test);
  }

  if (phase === 'answer-expired') {
    return finalizeSubmission(session.id, true);
  }

  return session;
}

export async function finalizeSubmission(sessionId: string, autoSubmitted = false) {
  const session = await prisma.studentTestSession.findUnique({
    where: { id: sessionId },
    include: {
      answers: true,
      selections: true,
    },
  });
  if (!session) {
    throw new Error('Session not found');
  }
  if (session.status === SessionStatus.SUBMITTED || session.status === SessionStatus.AUTO_SUBMITTED) {
    return session;
  }

  const answeredCount = session.answers.length;
  const correctCount = session.answers.filter((answer) => answer.isCorrect).length;
  const wrongCount = answeredCount - correctCount;
  const scorePercent = session.selections.length
    ? (correctCount / session.selections.length) * 100
    : 0;

  const updated = await prisma.studentTestSession.update({
    where: { id: sessionId },
    data: {
      status: autoSubmitted ? SessionStatus.AUTO_SUBMITTED : SessionStatus.SUBMITTED,
      submittedAt: new Date(),
      autoSubmitted,
      totalSelectedCount: session.selections.length,
      totalAnsweredCount: answeredCount,
      correctCount,
      wrongCount,
      scorePercent,
      resultSummary: {
        upsert: {
          update: {
            selectionCount: session.selections.length,
            answeredCount,
            correctCount,
            wrongCount,
            scorePercent,
          },
          create: {
            selectionCount: session.selections.length,
            answeredCount,
            correctCount,
            wrongCount,
            scorePercent,
          },
        },
      },
    },
  });

  return updated;
}

export async function endTestNow(testId: string) {
  const test = await prisma.test.findUnique({ where: { id: testId } });
  if (!test) {
    throw new Error('Test not found');
  }

  const endedAt = new Date();
  const closedTest = await prisma.test.update({
    where: { id: testId },
    data: {
      status: TestStatus.CLOSED,
      scheduledEndAt: endedAt,
    },
  });

  const activeStatuses = [
    SessionStatus.NOT_STARTED,
    SessionStatus.WAITING,
    SessionStatus.READING,
    SessionStatus.ANSWERING,
  ];
  const activeSessions = await prisma.studentTestSession.findMany({
    where: { testId, status: { in: activeStatuses } },
    select: { id: true },
  });

  await Promise.all(activeSessions.map((session) => finalizeSubmission(session.id, true)));
  return closedTest;
}

export function buildSessionQuestionOrder<T extends { question: { id: string } }>(
  testQuestions: T[],
  mode: Test['questionOrderMode'],
) {
  const list = [...testQuestions];
  if (mode === 'SHUFFLED') {
    list.sort((a, b) => a.question.id.localeCompare(b.question.id));
  }
  return list;
}

export function shuffleOptions<T>(options: T[], seedKey: string, mode: Test['optionOrderMode']) {
  if (mode === 'FIXED') {
    return options;
  }
  return [...options].sort((a, b) => `${seedKey}${JSON.stringify(a)}`.localeCompare(`${seedKey}${JSON.stringify(b)}`));
}

export async function upsertAuditLog(data: Prisma.AuditLogUncheckedCreateInput) {
  await prisma.auditLog.create({ data });
}

export function normalizeAnswerText(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}
