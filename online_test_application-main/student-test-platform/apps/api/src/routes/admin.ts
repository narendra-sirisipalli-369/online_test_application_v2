// @ts-nocheck
import fs from 'node:fs';
import path from 'node:path';
import ExcelJS from 'exceljs';
import { Router } from 'express';
import {
  ContentBlockType,
  MockExamType,
  OptionOrderMode,
  QuestionAnswerType,
  QuestionOrderMode,
  QuestionSourceType,
  ResultVisibility,
  SessionStatus,
  TestStatus,
  TestMode,
  UserRole,
  VerificationStatus,
} from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireRole } from '../middleware/auth.js';
import { runPreprocessing } from '../services/preprocess-service.js';
import { buildImportedContentBlocks, formatImportedText } from '../utils/imported-question.js';
import { serializeQuestion, serializeTest } from '../utils/serializers.js';
import { asyncHandler } from '../utils/async-handler.js';
import { upload } from '../utils/storage.js';
import { endTestNow, unlockLobby, upsertAuditLog } from '../services/test-session-service.js';

const adminOnly = requireRole(UserRole.ADMIN);

const testSchema = z.object({
  title: z.string().min(2),
  description: z.string().optional(),
  mode: z.nativeEnum(TestMode).default(TestMode.SECTIONAL),
  mockExamType: z.nativeEnum(MockExamType).nullable().optional(),
  mockStructure: z.unknown().optional(),
  scheduledStartAt: z.string().datetime(),
  scheduledEndAt: z.string().datetime(),
  readingDurationSec: z.number().int().min(60),
  answerDurationSec: z.number().int().min(60),
  thresholdCount: z.number().int().min(1),
  allowAboveThreshold: z.boolean().default(true),
  maxSelectableCount: z.number().int().min(1).nullable().optional(),
  questionOrderMode: z.nativeEnum(QuestionOrderMode).default(QuestionOrderMode.FIXED),
  optionOrderMode: z.nativeEnum(OptionOrderMode).default(OptionOrderMode.FIXED),
  resultVisibility: z.nativeEnum(ResultVisibility).default(ResultVisibility.HIDDEN),
}).superRefine((data, context) => {
  if (data.mode === TestMode.MOCK && !data.mockExamType) {
    context.addIssue({ code: 'custom', message: 'Choose CAT or IPMAT for a mock test', path: ['mockExamType'] });
  }
});

const questionSchema = z.object({
  paragraph: z.string().optional().nullable(),
  questionText: z.string().min(1),
  textBeforeImage: z.string().optional().nullable(),
  textAfterImage: z.string().optional().nullable(),
  imagePath: z.string().optional().nullable(),
  topic: z.string().optional().nullable(),
  answerType: z.nativeEnum(QuestionAnswerType).default(QuestionAnswerType.OPTIONS),
  correctOptionKey: z.string().optional().nullable(),
  correctTextAnswer: z.string().optional().nullable(),
  verificationStatus: z.nativeEnum(VerificationStatus).default(VerificationStatus.APPROVED),
  finalApproved: z.boolean().default(true),
  options: z.array(z.object({
    key: z.string().min(1),
    content: z.string().optional().default(''),
  })).max(4).optional().default([]),
  contentBlocks: z.array(z.object({
    blockType: z.nativeEnum(ContentBlockType),
    textContent: z.string().optional().nullable(),
    imagePath: z.string().optional().nullable(),
  })).optional().default([]),
}).refine((data) => (
  data.answerType === QuestionAnswerType.TEXT
    ? Boolean(data.correctTextAnswer?.trim())
    : data.options.length === 4 && Boolean(data.correctOptionKey?.trim())
), {
  message: 'Provide 4 options with an answer key for option questions, or a correct answer for text-entry questions',
});

const bankQuestionInputSchema = z.object({
  questionText: z.string().min(1),
  imagePath: z.string().optional().nullable(),
  answerType: z.nativeEnum(QuestionAnswerType).default(QuestionAnswerType.OPTIONS),
  options: z.array(z.object({
    key: z.string().min(1),
    content: z.string().optional().default(''),
  })).max(4).optional().default([]),
  correctOptionKey: z.string().optional().nullable(),
  correctTextAnswer: z.string().optional().nullable(),
}).refine((data) => (
  data.answerType === QuestionAnswerType.TEXT
    ? Boolean(data.correctTextAnswer?.trim())
    : data.options.length === 4 && Boolean(data.correctOptionKey?.trim()) && data.options.every((option) => option.content.trim())
), {
  message: 'Each question needs all 4 options filled in with an answer key, or a correct text answer',
});

const bankSectionSchema = z.object({
  paragraph: z.string().optional().default(''),
  subject: z.string().optional().default(''),
  questions: z.array(bankQuestionInputSchema).min(1),
});

const createBankSchema = z.object({
  name: z.string().min(1),
  mockExamType: z.nativeEnum(MockExamType).nullable().optional(),
  sections: z.array(bankSectionSchema).min(1),
});

function normalizeQuestionText(text: string) {
  return text.trim().toLowerCase().replace(/\s+/g, ' ');
}

function extractQuestionNumber(originalPayload: unknown) {
  if (!originalPayload || typeof originalPayload !== 'object') return null;
  const extracted = (originalPayload as { extracted?: { actual_number?: string; question_number?: string } }).extracted;
  return extracted?.actual_number || extracted?.question_number || null;
}

function normalizeGroupText(text: string) {
  return text.replace(/\s+/g, ' ').trim();
}

function getQuestionGroupKey(question: { id: string; paragraph?: string | null; imagePath?: string | null }) {
  const paragraph = normalizeGroupText(question.paragraph || '');
  const imagePath = (question.imagePath || '').trim();
  if (!paragraph && !imagePath) {
    return `solo:${question.id}`;
  }
  return `${paragraph}\u0000${imagePath}`;
}

function extractPassageTables(paragraph: string) {
  const tables: Array<{ id: string; rows: string[][] }> = [];
  let plainText = '';
  let cursor = 0;

  while (cursor < paragraph.length) {
    const markerIndex = paragraph.indexOf('TableJSON:', cursor);
    if (markerIndex === -1) {
      plainText += paragraph.slice(cursor);
      break;
    }
    plainText += paragraph.slice(cursor, markerIndex);
    const jsonStart = paragraph.indexOf('{', markerIndex);
    if (jsonStart === -1) {
      plainText += paragraph.slice(markerIndex);
      break;
    }

    let depth = 0;
    let inString = false;
    let escaped = false;
    let jsonEnd = -1;
    for (let index = jsonStart; index < paragraph.length; index += 1) {
      const character = paragraph[index];
      if (escaped) { escaped = false; continue; }
      if (character === '\\') { escaped = true; continue; }
      if (character === '"') { inString = !inString; continue; }
      if (inString) continue;
      if (character === '{') depth += 1;
      if (character === '}') {
        depth -= 1;
        if (depth === 0) { jsonEnd = index; break; }
      }
    }
    if (jsonEnd === -1) {
      plainText += paragraph.slice(markerIndex);
      break;
    }

    try {
      const parsed = JSON.parse(paragraph.slice(jsonStart, jsonEnd + 1)) as Record<string, string[][]>;
      for (const [id, rows] of Object.entries(parsed)) {
        if (Array.isArray(rows)) tables.push({ id, rows });
      }
      plainText += '[See Passage tables sheet]';
    } catch {
      plainText += paragraph.slice(markerIndex, jsonEnd + 1);
    }
    cursor = jsonEnd + 1;
  }

  return { plainText: plainText.replace(/\n{3,}/g, '\n\n').trim(), tables };
}

export const adminRouter = Router();
adminRouter.use(adminOnly);

adminRouter.get('/dashboard', asyncHandler(async (_req, res) => {
  const [tests, questions, students, documents] = await Promise.all([
    prisma.test.count(),
    prisma.question.count(),
    prisma.user.count({ where: { role: UserRole.STUDENT } }),
    prisma.importedDocument.count(),
  ]);
  res.json({ counts: { tests, questions, students, documents } });
}));

adminRouter.get('/reviews-ratings', asyncHandler(async (_req, res) => {
  const sessions = await prisma.studentTestSession.findMany({
    where: {
      OR: [
        { rating: { not: null } },
        { studentReview: { not: null } },
      ],
    },
    include: {
      student: { include: { avatar: true } },
      test: { select: { id: true, title: true } },
    },
  });

  const reviews = sessions
    .map((session) => ({
      id: session.id,
      rating: session.rating,
      review: session.studentReview,
      submittedAt: session.feedbackSubmittedAt || session.updatedAt,
      student: {
        id: session.student.id,
        name: session.student.name,
        course: session.student.course,
        avatar: session.student.avatar,
      },
      test: session.test,
    }))
    .sort((left, right) => right.submittedAt.getTime() - left.submittedAt.getTime());
  const ratedReviews = reviews.filter((review) => review.rating != null);

  res.json({
    summary: {
      total: reviews.length,
      writtenReviewCount: reviews.filter((review) => Boolean(review.review?.trim())).length,
      averageRating: ratedReviews.length
        ? ratedReviews.reduce((sum, review) => sum + (review.rating || 0), 0) / ratedReviews.length
        : null,
      fiveStarCount: ratedReviews.filter((review) => review.rating === 5).length,
    },
    reviews,
  });
}));

adminRouter.get('/students', asyncHandler(async (_req, res) => {
  const students = await prisma.user.findMany({
    where: { role: UserRole.STUDENT },
    include: {
      avatar: true,
      _count: { select: { studentSessions: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
  res.json({
    students: students.map((student) => ({
      id: student.id,
      name: student.name,
      course: student.course,
      mobileNumber: student.mobileNumber,
      isBlocked: student.isBlocked,
      avatar: student.avatar,
      sessionCount: student._count.studentSessions,
      createdAt: student.createdAt,
    })),
  });
}));

adminRouter.get('/students/:studentId/history', asyncHandler(async (req, res) => {
  const student = await prisma.user.findUnique({
    where: { id: req.params.studentId },
    include: {
      avatar: true,
      studentSessions: {
        include: { test: { select: { id: true, title: true, mode: true } } },
        orderBy: { createdAt: 'desc' },
      },
    },
  });
  if (!student || student.role !== UserRole.STUDENT) {
    return res.status(404).json({ message: 'Student not found' });
  }

  const completedSessions = student.studentSessions.filter((session) => (
    session.status === SessionStatus.SUBMITTED || session.status === SessionStatus.AUTO_SUBMITTED
  ));

  res.json({
    student: {
      id: student.id,
      name: student.name,
      course: student.course,
      mobileNumber: student.mobileNumber,
      isBlocked: student.isBlocked,
      avatar: student.avatar,
      createdAt: student.createdAt,
    },
    summary: {
      totalSessions: student.studentSessions.length,
      completedSessions: completedSessions.length,
      averageScore: completedSessions.length
        ? completedSessions.reduce((sum, session) => sum + session.scorePercent, 0) / completedSessions.length
        : null,
      ratedSessions: student.studentSessions.filter((session) => session.rating != null).length,
    },
    history: student.studentSessions.map((session) => ({
      id: session.id,
      test: session.test,
      status: session.status,
      startedAt: session.startedAt,
      submittedAt: session.submittedAt,
      selectedCount: session.totalSelectedCount,
      answeredCount: session.totalAnsweredCount,
      correctCount: session.correctCount,
      wrongCount: session.wrongCount,
      scorePercent: session.scorePercent,
      totalAnswerTimeSec: session.totalAnswerTimeSec,
      rating: session.rating,
      review: session.studentReview,
    })),
  });
}));

adminRouter.get('/students/:studentId/history/:sessionId/questions', asyncHandler(async (req, res) => {
  const session = await prisma.studentTestSession.findFirst({
    where: {
      id: req.params.sessionId,
      studentId: req.params.studentId,
    },
    include: {
      answers: true,
      selections: true,
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
            orderBy: { sortOrder: 'asc' },
          },
        },
      },
    },
  });

  if (!session) {
    return res.status(404).json({ message: 'Test attempt not found for this student' });
  }

  const selectedQuestionIds = new Set(session.selections.map((selection) => selection.questionId));
  const answersByQuestionId = new Map(session.answers.map((answer) => [answer.questionId, answer]));
  const questions = session.test.testQuestions
    .filter((item) => selectedQuestionIds.has(item.questionId))
    .map((item) => {
      const question = item.question;
      const answer = answersByQuestionId.get(question.id);
      const options = [...question.options]
        .sort((left, right) => left.sortOrder - right.sortOrder)
        .map((option) => ({ key: option.optionKey, content: option.content }));
      const correctAnswer = question.answerType === QuestionAnswerType.TEXT
        ? question.correctTextAnswer
        : question.correctOptionKey;

      return {
        id: question.id,
        questionNumber: extractQuestionNumber(question.originalPayload) || String(item.sortOrder),
        paragraph: question.paragraph,
        questionText: question.questionText,
        imagePath: question.imagePath,
        topic: question.topic,
        answerType: question.answerType,
        options,
        correctAnswer,
        correctAnswerContent: question.answerType === QuestionAnswerType.OPTIONS
          ? options.find((option) => option.key === correctAnswer)?.content || null
          : correctAnswer,
        studentAnswer: answer?.selectedOptionKey || null,
        studentAnswerContent: question.answerType === QuestionAnswerType.OPTIONS
          ? options.find((option) => option.key === answer?.selectedOptionKey)?.content || null
          : answer?.selectedOptionKey || null,
        result: !answer ? 'NOT_ANSWERED' : answer.isCorrect ? 'CORRECT' : 'WRONG',
        answeredAt: answer?.answeredAt || null,
      };
    });

  res.json({
    session: {
      id: session.id,
      testId: session.testId,
      testTitle: session.test.title,
    },
    questions,
  });
}));

adminRouter.patch('/students/:studentId/block', asyncHandler(async (req, res) => {
  const schema = z.object({ blocked: z.boolean() });
  const payload = schema.parse(req.body);

  const student = await prisma.user.findUnique({ where: { id: req.params.studentId } });
  if (!student || student.role !== UserRole.STUDENT) {
    return res.status(404).json({ message: 'Student not found' });
  }

  const updated = await prisma.user.update({
    where: { id: student.id },
    data: { isBlocked: payload.blocked },
  });
  res.json({ id: updated.id, isBlocked: updated.isBlocked });
}));

adminRouter.delete('/students/:studentId', asyncHandler(async (req, res) => {
  const student = await prisma.user.findUnique({ where: { id: req.params.studentId } });
  if (!student || student.role !== UserRole.STUDENT) {
    return res.status(404).json({ message: 'Student not found' });
  }

  await prisma.$transaction([
    prisma.studentTestSession.deleteMany({ where: { studentId: student.id } }),
    prisma.user.delete({ where: { id: student.id } }),
  ]);
  res.json({ ok: true });
}));

adminRouter.get('/tests', asyncHandler(async (_req, res) => {
  const tests = await prisma.test.findMany({
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
    orderBy: { createdAt: 'desc' },
  });
  res.json({ tests: tests.map(serializeTest) });
}));

adminRouter.post('/tests', asyncHandler(async (req, res) => {
  const payload = testSchema.parse(req.body);
  const test = await prisma.test.create({
    data: {
      ...payload,
      scheduledStartAt: new Date(payload.scheduledStartAt),
      scheduledEndAt: new Date(payload.scheduledEndAt),
      createdById: req.auth!.userId,
    },
    include: { testQuestions: { include: { question: { include: { options: true, contentBlocks: true } } } } },
  });
  await upsertAuditLog({
    userId: req.auth!.userId,
    action: 'CREATE_TEST',
    entityType: 'Test',
    entityId: test.id,
  });
  res.status(201).json({ test: serializeTest(test) });
}));

adminRouter.get('/tests/:testId', asyncHandler(async (req, res) => {
  const test = await prisma.test.findUnique({
    where: { id: req.params.testId },
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
  });
  if (!test) {
    return res.status(404).json({ message: 'Test not found' });
  }
  res.json({ test: serializeTest(test) });
}));

adminRouter.put('/tests/:testId', asyncHandler(async (req, res) => {
  const payload = testSchema.partial().parse(req.body);
  const test = await prisma.test.update({
    where: { id: req.params.testId },
    data: {
      ...payload,
      scheduledStartAt: payload.scheduledStartAt ? new Date(payload.scheduledStartAt) : undefined,
      scheduledEndAt: payload.scheduledEndAt ? new Date(payload.scheduledEndAt) : undefined,
    },
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
  });
  res.json({ test: serializeTest(test) });
}));

adminRouter.post('/tests/:testId/publish', asyncHandler(async (req, res) => {
  const test = await prisma.test.findUnique({
    where: { id: req.params.testId },
    include: {
      testQuestions: {
        include: {
          question: true,
        },
      },
    },
  });
  if (!test) {
    return res.status(404).json({ message: 'Test not found' });
  }
  if (!test.testQuestions.length) {
    return res.status(400).json({ message: 'Add questions before publishing' });
  }

  const invalid = test.testQuestions.find((item) => {
    const question = item.question;
    if (!question.finalApproved) return true;
    return question.answerType === QuestionAnswerType.TEXT
      ? !question.correctTextAnswer
      : !question.correctOptionKey;
  });
  if (invalid) {
    return res.status(400).json({ message: 'All questions must be reviewed and have an answer key' });
  }

  const updated = await prisma.test.update({
    where: { id: test.id },
    data: {
      status: TestStatus.PUBLISHED,
      publishedAt: new Date(),
    },
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
  });

  res.json({ test: serializeTest(updated) });
}));

adminRouter.get('/banks', asyncHandler(async (_req, res) => {
  const [documents, banks] = await Promise.all([
    prisma.importedDocument.findMany({
      include: { _count: { select: { questions: true } } },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.questionBank.findMany({
      include: { _count: { select: { questions: true } } },
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  const combined = [
    ...documents.map((document) => ({
      id: document.id,
      name: document.fileName,
      type: 'IMPORTED',
      questionCount: document._count.questions,
      createdAt: document.createdAt,
    })),
    ...banks.map((bank) => ({
      id: bank.id,
      name: bank.name,
      type: 'MANUAL',
      mockExamType: bank.mockExamType,
      questionCount: bank._count.questions,
      createdAt: bank.createdAt,
    })),
  ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  res.json({ banks: combined });
}));

adminRouter.get('/banks/:bankId/questions', asyncHandler(async (req, res) => {
  const { bankId } = req.params;
  const [document, bank] = await Promise.all([
    prisma.importedDocument.findUnique({ where: { id: bankId } }),
    prisma.questionBank.findUnique({ where: { id: bankId } }),
  ]);
  if (!document && !bank) {
    return res.status(404).json({ message: 'Bank not found' });
  }

  const questions = await prisma.question.findMany({
    where: document ? { importedDocumentId: bankId } : { questionBankId: bankId },
    include: { options: true, contentBlocks: true },
    orderBy: { createdAt: 'asc' },
  });

  res.json({
    bank: document
      ? { id: document.id, name: document.fileName, type: 'IMPORTED' }
      : { id: bank.id, name: bank.name, type: 'MANUAL', mockExamType: bank.mockExamType },
    questions: questions.map(serializeQuestion),
  });
}));

adminRouter.delete('/banks/:bankId', asyncHandler(async (req, res) => {
  const { bankId } = req.params;
  const [document, bank] = await Promise.all([
    prisma.importedDocument.findUnique({ where: { id: bankId } }),
    prisma.questionBank.findUnique({ where: { id: bankId } }),
  ]);
  if (!document && !bank) {
    return res.status(404).json({ message: 'Bank not found' });
  }

  const questionWhere = document ? { importedDocumentId: bankId } : { questionBankId: bankId };
  const attachedToTest = await prisma.testQuestion.findFirst({ where: { question: questionWhere } });
  if (attachedToTest) {
    return res.status(409).json({ message: 'This bank has questions attached to a test. Remove them from the test before deleting the bank.' });
  }

  await prisma.question.deleteMany({ where: questionWhere });
  if (document) {
    await prisma.importedDocument.delete({ where: { id: bankId } });
  } else {
    await prisma.questionBank.delete({ where: { id: bankId } });
  }

  res.json({ ok: true });
}));

adminRouter.post('/banks', asyncHandler(async (req, res) => {
  const payload = createBankSchema.parse(req.body);
  const trimmedName = payload.name.trim();

  const [existingBank, existingDocument] = await Promise.all([
    prisma.questionBank.findFirst({ where: { name: { equals: trimmedName, mode: 'insensitive' } } }),
    prisma.importedDocument.findFirst({ where: { fileName: { equals: trimmedName, mode: 'insensitive' } } }),
  ]);
  if (existingBank || existingDocument) {
    return res.status(409).json({ message: `A question bank named "${trimmedName}" already exists. Choose a different name.` });
  }

  const seenQuestionTexts = new Set<string>();
  for (const section of payload.sections) {
    for (const item of section.questions) {
      const normalized = normalizeQuestionText(item.questionText);
      if (seenQuestionTexts.has(normalized)) {
        return res.status(400).json({ message: `Duplicate question in this bank: "${item.questionText.trim()}"` });
      }
      seenQuestionTexts.add(normalized);
    }
  }

  const bank = await prisma.questionBank.create({
    data: {
      name: trimmedName,
      mockExamType: payload.mockExamType,
      createdById: req.auth!.userId,
    },
  });

  const createdQuestions = [];
  for (const section of payload.sections) {
    const formattedParagraph = formatImportedText(section.paragraph || '');
    for (const item of section.questions) {
      const isTextAnswer = item.answerType === QuestionAnswerType.TEXT;
      const question = await prisma.question.create({
        data: {
          sourceType: QuestionSourceType.MANUAL,
          questionBankId: bank.id,
          createdById: req.auth!.userId,
          updatedById: req.auth!.userId,
          paragraph: formattedParagraph,
          questionText: item.questionText,
          textBeforeImage: item.questionText,
          textAfterImage: '',
          imagePath: item.imagePath || '',
          topic: section.subject || '',
          answerType: item.answerType,
          correctOptionKey: isTextAnswer ? null : item.correctOptionKey,
          correctTextAnswer: isTextAnswer ? item.correctTextAnswer : null,
          verificationStatus: VerificationStatus.APPROVED,
          finalApproved: true,
          options: isTextAnswer ? undefined : {
            create: item.options.map((option, index) => ({
              optionKey: option.key,
              content: option.content,
              sortOrder: index + 1,
            })),
          },
          contentBlocks: {
            create: [
              { blockType: ContentBlockType.TEXT, textContent: item.questionText, sortOrder: 1 },
              ...(item.imagePath ? [{ blockType: ContentBlockType.IMAGE, imagePath: item.imagePath, sortOrder: 2 }] : []),
            ],
          },
        },
        include: { options: true, contentBlocks: true },
      });
      createdQuestions.push(question);
    }
  }

  res.status(201).json({ bank, questions: createdQuestions.map(serializeQuestion) });
}));

adminRouter.post('/imports/docx', upload.single('file'), asyncHandler(async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: 'DOCX file is required' });
  }

  const trimmedName = req.file.originalname.trim();
  const [existingDocument, existingBank] = await Promise.all([
    prisma.importedDocument.findFirst({ where: { fileName: { equals: trimmedName, mode: 'insensitive' } } }),
    prisma.questionBank.findFirst({ where: { name: { equals: trimmedName, mode: 'insensitive' } } }),
  ]);
  if (existingDocument || existingBank) {
    await fs.promises.unlink(req.file.path).catch(() => {});
    return res.status(409).json({ message: `A question bank named "${trimmedName}" already exists. Rename the file or delete the existing bank before re-importing.` });
  }

  const result = await runPreprocessing(req.file.path);
  const document = await prisma.importedDocument.create({
    data: {
      fileName: req.file.originalname,
      originalFilePath: req.file.path,
      outputAssetDir: result.assetDir,
      uploadedById: req.auth!.userId,
      originalPayload: {
        issues: result.issues,
        tables: result.tables,
      },
    },
  });

  const createdQuestions = [];
  for (const [index, item] of result.questions.entries()) {
    const options = [
      { key: 'A', content: item.option_a || '' },
      { key: 'B', content: item.option_b || '' },
      { key: 'C', content: item.option_c || '' },
      { key: 'D', content: item.option_d || '' },
    ];
    const hasOptions = options.some((option) => option.content.trim());
    const answerType = hasOptions ? QuestionAnswerType.OPTIONS : QuestionAnswerType.TEXT;
    const blockData = buildImportedContentBlocks({
      paragraph: item.paragraph || '',
      question: item.question || '',
      imageUrl: item.imageUrl || '',
    });
    const question = await prisma.question.create({
      data: {
        sourceType: QuestionSourceType.IMPORTED,
        importedDocumentId: document.id,
        createdById: req.auth!.userId,
        updatedById: req.auth!.userId,
        paragraph: formatImportedText(item.paragraph || ''),
        questionText: item.question || '',
        textBeforeImage: item.question || '',
        textAfterImage: '',
        imagePath: item.imageUrl || '',
        topic: item.topic || '',
        answerType,
        correctOptionKey: hasOptions ? (item.key || '') : null,
        correctTextAnswer: hasOptions ? null : (item.key || ''),
        verificationStatus: VerificationStatus.PENDING,
        finalApproved: false,
        originalPayload: {
          rowIndex: index + 1,
          extracted: item,
        },
        contentBlocks: {
          create: blockData,
        },
        options: hasOptions ? {
          create: options.map((option, optionIndex) => ({
            optionKey: option.key,
            content: option.content,
            sortOrder: optionIndex + 1,
          })),
        } : undefined,
      },
      include: {
        options: true,
        contentBlocks: true,
      },
    });

    await prisma.extractionReview.create({
      data: {
        importedDocumentId: document.id,
        questionId: question.id,
        reviewerId: req.auth!.userId,
        status: VerificationStatus.PENDING,
        originalData: item,
        finalData: item,
      },
    });

    createdQuestions.push(question);
  }

  res.status(201).json({
    document,
    questions: createdQuestions.map(serializeQuestion),
    issues: result.issues,
    tables: result.tables,
  });
}));

adminRouter.get('/imports/:documentId/questions', asyncHandler(async (req, res) => {
  const questions = await prisma.question.findMany({
    where: { importedDocumentId: req.params.documentId },
    include: {
      options: true,
      contentBlocks: true,
      reviews: true,
    },
    orderBy: { createdAt: 'asc' },
  });
  res.json({ questions: questions.map(serializeQuestion) });
}));

adminRouter.get('/imports/:documentId/export', asyncHandler(async (req, res) => {
  const document = await prisma.importedDocument.findUnique({ where: { id: req.params.documentId } });
  if (!document) {
    return res.status(404).json({ message: 'Imported document not found' });
  }

  const questions = await prisma.question.findMany({
    where: { importedDocumentId: req.params.documentId },
    include: { options: true },
    orderBy: { createdAt: 'asc' },
  });

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Extracted questions');
  worksheet.columns = [
    { header: '#', key: 'row', width: 6 },
    { header: 'Paragraph', key: 'paragraph', width: 60 },
    { header: 'Question', key: 'question', width: 50 },
    { header: 'Option A', key: 'optionA', width: 25 },
    { header: 'Option B', key: 'optionB', width: 25 },
    { header: 'Option C', key: 'optionC', width: 25 },
    { header: 'Option D', key: 'optionD', width: 25 },
    { header: 'Answer type', key: 'answerType', width: 14 },
    { header: 'Correct answer', key: 'correctAnswer', width: 18 },
    { header: 'Topic', key: 'topic', width: 16 },
    { header: 'Verification', key: 'verification', width: 14 },
    { header: 'Final approved', key: 'finalApproved', width: 14 },
    { header: 'Image path', key: 'imagePath', width: 45 },
  ];
  worksheet.getRow(1).font = { bold: true };

  let previousParagraph = '';
  let passageNumber = 0;
  const passageTables: Array<{ label: string; id: string; rows: string[][] }> = [];
  questions.forEach((question, index) => {
    const optionByKey = Object.fromEntries(question.options.map((option) => [option.optionKey, option.content]));
    const paragraph = formatImportedText(question.paragraph || '');
    const shouldRepeatParagraph = paragraph !== previousParagraph;
    if (shouldRepeatParagraph) {
      passageNumber += 1;
      const extracted = extractPassageTables(paragraph);
      passageTables.push(...extracted.tables.map((table) => ({
        label: `Passage ${passageNumber}`,
        id: table.id,
        rows: table.rows,
      })));
    }
    worksheet.addRow({
      row: extractQuestionNumber(question.originalPayload) || index + 1,
      paragraph: shouldRepeatParagraph ? extractPassageTables(paragraph).plainText : '',
      question: question.questionText,
      optionA: optionByKey.A || '',
      optionB: optionByKey.B || '',
      optionC: optionByKey.C || '',
      optionD: optionByKey.D || '',
      answerType: question.answerType,
      correctAnswer: question.answerType === 'TEXT' ? (question.correctTextAnswer || '') : (question.correctOptionKey || ''),
      topic: question.topic || '',
      verification: question.verificationStatus,
      finalApproved: question.finalApproved ? 'Yes' : 'No',
      imagePath: question.imagePath || '',
    });
    previousParagraph = paragraph;
  });

  worksheet.getColumn('paragraph').alignment = { wrapText: true, vertical: 'top' };
  worksheet.getColumn('question').alignment = { wrapText: true, vertical: 'top' };
  worksheet.getColumn('imagePath').alignment = { wrapText: true, vertical: 'top' };

  if (passageTables.length) {
    const tableSheet = workbook.addWorksheet('Passage tables');
    for (const table of passageTables) {
      tableSheet.addRow([`${table.label} - ${table.id}`]).font = { bold: true };
      table.rows.forEach((row, rowIndex) => {
        const excelRow = tableSheet.addRow(row);
        if (rowIndex === 0) excelRow.font = { bold: true };
      });
      tableSheet.addRow([]);
    }
    tableSheet.columns.forEach((column) => { column.width = 22; });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${document.fileName.replace(/\.docx$/i, '').replace(/\s+/g, '_')}_extracted.xlsx"`);
  res.send(Buffer.from(buffer));
}));

adminRouter.put('/questions/:questionId', asyncHandler(async (req, res) => {
  const payload = questionSchema.parse(req.body);
  const existingQuestion = await prisma.question.findUnique({
    where: { id: req.params.questionId },
    select: { importedDocumentId: true },
  });
  const rebuiltBlocks = payload.contentBlocks.length
    ? payload.contentBlocks
    : [
        {
          blockType: ContentBlockType.TEXT,
          textContent: payload.textBeforeImage || payload.questionText,
          imagePath: null,
        },
        ...(payload.imagePath ? [{
          blockType: ContentBlockType.IMAGE,
          textContent: null,
          imagePath: payload.imagePath,
        }] : []),
        ...(payload.textAfterImage ? [{
          blockType: ContentBlockType.TEXT,
          textContent: payload.textAfterImage,
          imagePath: null,
        }] : []),
      ];
  const isTextAnswer = payload.answerType === QuestionAnswerType.TEXT;
  const question = await prisma.question.update({
    where: { id: req.params.questionId },
    data: {
      paragraph: formatImportedText(payload.paragraph || ''),
      questionText: payload.questionText,
      textBeforeImage: payload.textBeforeImage || payload.questionText,
      textAfterImage: payload.textAfterImage || '',
      imagePath: payload.imagePath || '',
      topic: payload.topic || '',
      answerType: payload.answerType,
      correctOptionKey: isTextAnswer ? null : payload.correctOptionKey,
      correctTextAnswer: isTextAnswer ? payload.correctTextAnswer : null,
      verificationStatus: payload.verificationStatus,
      finalApproved: payload.finalApproved,
      updatedById: req.auth!.userId,
      options: {
        deleteMany: {},
        create: isTextAnswer ? [] : payload.options.map((option, index) => ({
          optionKey: option.key,
          content: option.content,
          sortOrder: index + 1,
        })),
      },
      contentBlocks: {
        deleteMany: {},
        create: rebuiltBlocks.map((block, index) => ({
          blockType: block.blockType,
          textContent: block.textContent || null,
          imagePath: block.imagePath || null,
          sortOrder: index + 1,
        })),
      },
      ...(existingQuestion?.importedDocumentId ? {
        reviews: {
          create: {
            importedDocumentId: existingQuestion.importedDocumentId,
            reviewerId: req.auth!.userId,
            status: payload.verificationStatus,
            finalData: payload,
          },
        },
      } : {}),
    },
    include: {
      options: true,
      contentBlocks: true,
    },
  });
  res.json({ question: serializeQuestion(question) });
}));

adminRouter.post('/uploads/image', upload.single('image'), asyncHandler(async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: 'Image file is required' });
  }
  res.status(201).json({ path: `/uploads/${path.basename(req.file.path)}` });
}));

adminRouter.post('/questions/manual', upload.single('image'), asyncHandler(async (req, res) => {
  const rawBlocks = req.body.contentBlocks ? JSON.parse(String(req.body.contentBlocks)) : [];
  const rawOptions = req.body.options ? JSON.parse(String(req.body.options)) : [];
  const payload = questionSchema.parse({
    paragraph: req.body.paragraph,
    questionText: req.body.questionText,
    textBeforeImage: req.body.textBeforeImage,
    textAfterImage: req.body.textAfterImage,
    imagePath: req.file ? `/uploads/${path.basename(req.file.path)}` : req.body.imagePath,
    topic: req.body.topic,
    answerType: req.body.answerType || QuestionAnswerType.OPTIONS,
    correctOptionKey: req.body.correctOptionKey,
    correctTextAnswer: req.body.correctTextAnswer,
    verificationStatus: req.body.verificationStatus || VerificationStatus.APPROVED,
    finalApproved: req.body.finalApproved !== 'false',
    options: rawOptions,
    contentBlocks: rawBlocks,
  });
  const isTextAnswer = payload.answerType === QuestionAnswerType.TEXT;

  const normalizedBlocks = payload.contentBlocks.length
    ? payload.contentBlocks.map((block) => ({
        ...block,
        imagePath: block.imagePath === '__uploaded__' ? payload.imagePath : block.imagePath,
      }))
    : [
        { blockType: ContentBlockType.TEXT, textContent: payload.textBeforeImage || payload.questionText, imagePath: null },
        ...(payload.imagePath ? [{ blockType: ContentBlockType.IMAGE, textContent: null, imagePath: payload.imagePath }] : []),
        ...(payload.textAfterImage ? [{ blockType: ContentBlockType.TEXT, textContent: payload.textAfterImage, imagePath: null }] : []),
      ];

  const question = await prisma.question.create({
    data: {
      sourceType: QuestionSourceType.MANUAL,
      createdById: req.auth!.userId,
      updatedById: req.auth!.userId,
      paragraph: formatImportedText(payload.paragraph || ''),
      questionText: payload.questionText,
      textBeforeImage: payload.textBeforeImage || payload.questionText,
      textAfterImage: payload.textAfterImage || '',
      imagePath: payload.imagePath || '',
      topic: payload.topic || '',
      answerType: payload.answerType,
      correctOptionKey: isTextAnswer ? null : payload.correctOptionKey,
      correctTextAnswer: isTextAnswer ? payload.correctTextAnswer : null,
      verificationStatus: payload.verificationStatus,
      finalApproved: payload.finalApproved,
      options: isTextAnswer ? undefined : {
        create: payload.options.map((option, index) => ({
          optionKey: option.key,
          content: option.content,
          sortOrder: index + 1,
        })),
      },
      contentBlocks: {
        create: normalizedBlocks.map((block, index) => ({
          blockType: block.blockType,
          textContent: block.textContent || null,
          imagePath: block.imagePath || null,
          sortOrder: index + 1,
        })),
      },
    },
    include: {
      options: true,
      contentBlocks: true,
    },
  });
  res.status(201).json({ question: serializeQuestion(question) });
}));

adminRouter.get('/questions', asyncHandler(async (_req, res) => {
  const questions = await prisma.question.findMany({
    include: {
      options: true,
      contentBlocks: true,
    },
    orderBy: { createdAt: 'asc' },
  });
  res.json({ questions: questions.map(serializeQuestion) });
}));

adminRouter.post('/tests/:testId/questions', asyncHandler(async (req, res) => {
  const payload = z.object({
    questionIds: z.array(z.string()).min(1),
  }).parse(req.body);

  const targetTest = await prisma.test.findUnique({ where: { id: req.params.testId } });
  if (!targetTest) return res.status(404).json({ message: 'Test not found' });
  if (targetTest.mode === TestMode.MOCK) {
    const mockQuestions = await prisma.question.findMany({
      where: { id: { in: payload.questionIds } },
      include: { questionBank: true },
    });
    const invalidQuestion = mockQuestions.length !== payload.questionIds.length || mockQuestions.find((question) => (
      question.sourceType === QuestionSourceType.IMPORTED
      || !question.questionBank
      || question.questionBank.mockExamType !== targetTest.mockExamType
    ));
    if (invalidQuestion) {
      return res.status(400).json({ message: `A ${targetTest.mockExamType} mock test can only use manually entered questions from a ${targetTest.mockExamType} mock bank.` });
    }
    const structure = targetTest.mockStructure as { sections?: Array<{ name: string; questions: number }> } | null;
    if (!structure?.sections?.length) {
      return res.status(400).json({ message: 'This mock test is missing its exam template.' });
    }
    const incorrectSection = structure.sections.find((section) => (
      mockQuestions.filter((question) => question.topic === section.name).length !== section.questions
    ));
    if (incorrectSection || mockQuestions.some((question) => !structure.sections!.some((section) => section.name === question.topic))) {
      return res.status(400).json({ message: `Use the required subject counts for this mock template. ${incorrectSection?.name || 'Each question'} does not match the configured structure.` });
    }
    const invalidAnswerFormat = mockQuestions.find((question) => (
      (targetTest.mockExamType === MockExamType.IPMAT_INDORE && question.topic === 'QA SA' && question.answerType !== QuestionAnswerType.TEXT)
      || (targetTest.mockExamType === MockExamType.IPMAT_INDORE && question.topic !== 'QA SA' && question.answerType !== QuestionAnswerType.OPTIONS)
      || (targetTest.mockExamType === MockExamType.IPMAT_ROHTAK && question.answerType !== QuestionAnswerType.OPTIONS)
    ));
    if (invalidAnswerFormat) {
      return res.status(400).json({ message: 'The selected questions do not match the required MCQ or short-answer format for this mock template.' });
    }
  }

  await prisma.testQuestion.deleteMany({
    where: { testId: req.params.testId },
  });
  await prisma.testQuestion.createMany({
    data: payload.questionIds.map((questionId, index) => ({
      testId: req.params.testId,
      questionId,
      sortOrder: index + 1,
    })),
  });
  const test = await prisma.test.findUnique({
    where: { id: req.params.testId },
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
  });
  res.json({ test: serializeTest(test!) });
}));

adminRouter.get('/tests/:testId/analytics', asyncHandler(async (req, res) => {
  const test = await prisma.test.findUnique({
    where: { id: req.params.testId },
    include: {
      sessions: {
        include: {
          student: { include: { avatar: true } },
          answers: true,
          selections: true,
        },
      },
      testQuestions: {
        orderBy: { sortOrder: 'asc' },
        include: {
          question: {
            include: {
              options: true,
              answers: {
                include: {
                  session: {
                    include: {
                      student: true,
                    },
                  },
                },
              },
              selections: {
                include: {
                  session: {
                    include: {
                      student: true,
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });
  if (!test) {
    return res.status(404).json({ message: 'Test not found' });
  }

  const studentPerformance = test.sessions.map((session) => ({
    studentId: session.studentId,
    studentName: session.student.name,
    avatar: session.student.avatar,
    selectedCount: session.totalSelectedCount,
    answeredCount: session.totalAnsweredCount,
    correctCount: session.correctCount,
    wrongCount: session.wrongCount,
    scorePercent: session.scorePercent,
    totalAnswerTimeSec: session.totalAnswerTimeSec,
    status: session.status,
    submittedAt: session.submittedAt,
    rating: session.rating,
  }));

  const leaderboard = [...studentPerformance]
    .sort((a, b) => b.scorePercent - a.scorePercent || a.totalAnswerTimeSec - b.totalAnswerTimeSec)
    .slice(0, 10);

  const groupedStats = new Map<string, {
    groupId: string;
    questionNumber: string;
    questionText: string;
    paragraph: string | null;
    imagePath: string | null;
    questions: Array<{
      questionId: string;
      questionNumber: string;
      questionText: string;
      answerType: QuestionAnswerType;
      options: Array<{ key: string; content: string }>;
      correctAnswer: string | null;
    }>;
    selectedStudentIds: Set<string>;
    selectedStudentNames: Set<string>;
    correctStudentIds: Set<string>;
    correctStudentNames: Set<string>;
    wrongStudentIds: Set<string>;
    wrongStudentNames: Set<string>;
  }>();

  for (const item of test.testQuestions) {
    const question = item.question;
    const groupKey = getQuestionGroupKey(question);
    const existing = groupedStats.get(groupKey);
    const questionNumber = extractQuestionNumber(question.originalPayload) || String(item.sortOrder);

    if (!existing) {
      groupedStats.set(groupKey, {
        groupId: groupKey,
        questionNumber,
        questionText: question.paragraph || question.questionText,
        paragraph: question.paragraph,
        imagePath: question.imagePath,
        questions: [],
        selectedStudentIds: new Set<string>(),
        selectedStudentNames: new Set<string>(),
        correctStudentIds: new Set<string>(),
        correctStudentNames: new Set<string>(),
        wrongStudentIds: new Set<string>(),
        wrongStudentNames: new Set<string>(),
      });
    }

    groupedStats.get(groupKey)!.questions.push({
      questionId: question.id,
      questionNumber,
      questionText: question.questionText,
      answerType: question.answerType,
      options: [...question.options]
        .sort((left, right) => left.sortOrder - right.sortOrder)
        .map((option) => ({
          key: option.optionKey,
          content: option.content,
        })),
      correctAnswer: question.answerType === QuestionAnswerType.TEXT
        ? question.correctTextAnswer
        : question.correctOptionKey,
    });
  }

  for (const session of test.sessions) {
    const answersByQuestionId = new Map(session.answers.map((answer) => [answer.questionId, answer]));

    for (const [groupKey, group] of groupedStats.entries()) {
      const selectedQuestions = group.questions.filter((question) => (
        session.selections.some((selection) => selection.questionId === question.questionId)
      ));

      if (!selectedQuestions.length) continue;

      group.selectedStudentIds.add(session.studentId);
      group.selectedStudentNames.add(session.student.name);

      const allCorrect = selectedQuestions.every((question) => {
        const answer = answersByQuestionId.get(question.questionId);
        return Boolean(answer?.isCorrect);
      });

      if (allCorrect && selectedQuestions.length === group.questions.length) {
        group.correctStudentIds.add(session.studentId);
        group.correctStudentNames.add(session.student.name);
      } else {
        group.wrongStudentIds.add(session.studentId);
        group.wrongStudentNames.add(session.student.name);
      }

      groupedStats.set(groupKey, group);
    }
  }

  const questionStats = Array.from(groupedStats.values()).map((group) => ({
    questionId: group.groupId,
    questionNumber: group.questionNumber,
    questionText: group.questionText,
    paragraph: group.paragraph,
    imagePath: group.imagePath,
    questions: group.questions,
    selectedCount: group.selectedStudentIds.size,
    selectedStudentNames: Array.from(group.selectedStudentNames).sort((left, right) => left.localeCompare(right)),
    correctCount: group.correctStudentIds.size,
    correctStudentNames: Array.from(group.correctStudentNames).sort((left, right) => left.localeCompare(right)),
    wrongCount: group.wrongStudentIds.size,
    wrongStudentNames: Array.from(group.wrongStudentNames).sort((left, right) => left.localeCompare(right)),
  }));

  const ratedSessions = studentPerformance.filter((item) => item.rating != null);

  res.json({
    overview: {
      totalSessions: test.sessions.length,
      averageScore: studentPerformance.length
        ? studentPerformance.reduce((sum, item) => sum + item.scorePercent, 0) / studentPerformance.length
        : 0,
      averageRating: ratedSessions.length
        ? ratedSessions.reduce((sum, item) => sum + (item.rating as number), 0) / ratedSessions.length
        : null,
      ratingCount: ratedSessions.length,
    },
    leaderboard,
    studentPerformance,
    questionStats,
  });
}));

adminRouter.get('/tests/:testId/detailed-answers', asyncHandler(async (req, res) => {
  const sessions = await prisma.studentTestSession.findMany({
    where: { testId: req.params.testId },
    include: {
      student: true,
      selections: {
        include: {
          question: { include: { options: true } },
        },
      },
      answers: true,
    },
    orderBy: { student: { name: 'asc' } },
  });

  const rows = sessions.flatMap((session) => session.selections.map((selection) => {
    const question = selection.question;
    const answer = session.answers.find((item) => item.questionId === question.id);
    const isTextAnswer = question.answerType === 'TEXT';
    const timeTakenSec = answer && session.answerStartedAt
      ? Math.max(0, Math.round((answer.answeredAt.getTime() - session.answerStartedAt.getTime()) / 1000))
      : null;
    return {
      studentId: session.studentId,
      studentName: session.student.name,
      questionId: question.id,
      questionNumber: extractQuestionNumber(question.originalPayload),
      questionText: question.questionText,
      selectedAnswer: answer?.selectedOptionKey ?? null,
      correctAnswer: isTextAnswer ? question.correctTextAnswer : question.correctOptionKey,
      result: !answer ? 'NOT_ANSWERED' : answer.isCorrect ? 'CORRECT' : 'WRONG',
      timeTakenSec,
    };
  }));

  res.json({ rows });
}));

adminRouter.get('/tests/:testId/lobby', asyncHandler(async (req, res) => {
  const test = await prisma.test.findUnique({ where: { id: req.params.testId } });
  if (!test) {
    return res.status(404).json({ message: 'Test not found' });
  }
  const waitingSessions = await prisma.studentTestSession.findMany({
    where: { testId: test.id, status: SessionStatus.WAITING },
    include: { student: { include: { avatar: true } } },
    orderBy: { createdAt: 'asc' },
  });
  res.json({
    unlocked: Boolean(test.lobbyUnlockedAt),
    ended: test.status === TestStatus.CLOSED,
    waitingStudents: waitingSessions.map((session) => ({
      id: session.student.id,
      name: session.student.name,
      avatarUrl: session.student.avatar?.imageUrl || null,
    })),
  });
}));

adminRouter.post('/tests/:testId/unlock', asyncHandler(async (req, res) => {
  const test = await prisma.test.findUnique({ where: { id: req.params.testId } });
  if (!test) {
    return res.status(404).json({ message: 'Test not found' });
  }
  await unlockLobby(test.id);
  await upsertAuditLog({
    userId: req.auth!.userId,
    action: 'UNLOCK_TEST_LOBBY',
    entityType: 'Test',
    entityId: test.id,
  });
  res.json({ unlocked: true, waitingStudents: [] });
}));

adminRouter.post('/tests/:testId/end', asyncHandler(async (req, res) => {
  const test = await prisma.test.findUnique({ where: { id: req.params.testId } });
  if (!test) {
    return res.status(404).json({ message: 'Test not found' });
  }
  const updated = await endTestNow(test.id);
  await upsertAuditLog({
    userId: req.auth!.userId,
    action: 'END_TEST',
    entityType: 'Test',
    entityId: test.id,
  });
  res.json({ ok: true });
}));

adminRouter.get('/tests/:testId/export', asyncHandler(async (req, res) => {
  const test = await prisma.test.findUnique({
    where: { id: req.params.testId },
    include: {
      sessions: {
        include: {
          student: true,
        },
      },
    },
  });
  if (!test) {
    return res.status(404).json({ message: 'Test not found' });
  }

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Results');
  worksheet.addRow([
    'Student',
    'Selected',
    'Answered',
    'Correct',
    'Wrong',
    'Score %',
    'Total Answer Time (sec)',
    'Status',
  ]);

  for (const session of test.sessions) {
    worksheet.addRow([
      session.student.name,
      session.totalSelectedCount,
      session.totalAnsweredCount,
      session.correctCount,
      session.wrongCount,
      session.scorePercent,
      session.totalAnswerTimeSec,
      session.status,
    ]);
  }

  const buffer = await workbook.xlsx.writeBuffer();
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${test.title.replace(/\s+/g, '_')}_results.xlsx"`);
  res.send(Buffer.from(buffer));
}));
