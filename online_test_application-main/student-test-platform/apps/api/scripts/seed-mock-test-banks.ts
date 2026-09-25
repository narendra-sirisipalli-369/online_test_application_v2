import { ContentBlockType, MockExamType, QuestionAnswerType, QuestionSourceType, VerificationStatus } from '@prisma/client';
import { prisma } from '../src/lib/prisma.js';

type Section = { subject: string; count: number; answerType: QuestionAnswerType };
type BankDefinition = { name: string; exam: MockExamType; sections: Section[] };

const banks: BankDefinition[] = [
  {
    name: 'CAT Pattern E2E Bank — 2025 Structure',
    exam: MockExamType.CAT,
    sections: [
      { subject: 'VARC', count: 24, answerType: QuestionAnswerType.OPTIONS },
      { subject: 'DILR', count: 22, answerType: QuestionAnswerType.OPTIONS },
      { subject: 'QA', count: 22, answerType: QuestionAnswerType.OPTIONS },
    ],
  },
  {
    name: 'IPMAT Indore Pattern E2E Bank — 2025 Structure',
    exam: MockExamType.IPMAT_INDORE,
    sections: [
      { subject: 'QA MCQ', count: 30, answerType: QuestionAnswerType.OPTIONS },
      { subject: 'QA SA', count: 15, answerType: QuestionAnswerType.TEXT },
      { subject: 'VA', count: 45, answerType: QuestionAnswerType.OPTIONS },
    ],
  },
  {
    name: 'IPMAT Rohtak Pattern E2E Bank — 2025 Structure',
    exam: MockExamType.IPMAT_ROHTAK,
    sections: [
      { subject: 'QA', count: 40, answerType: QuestionAnswerType.OPTIONS },
      { subject: 'LR', count: 40, answerType: QuestionAnswerType.OPTIONS },
      { subject: 'VA', count: 40, answerType: QuestionAnswerType.OPTIONS },
    ],
  },
];

function questionText(bankName: string, subject: string, index: number) {
  if (subject.includes('QA')) return `${bankName}: ${subject} practice question ${index}. What is ${index} + ${index}?`;
  if (subject === 'DILR' || subject === 'LR') return `${bankName}: ${subject} reasoning question ${index}. In this fixture scenario, which listed option is valid?`;
  return `${bankName}: ${subject} verbal practice question ${index}. Select the grammatically correct response.`;
}

async function createBank(definition: BankDefinition) {
  const existing = await prisma.questionBank.findFirst({ where: { name: definition.name } });
  if (existing) {
    console.log(`Skipped existing bank: ${definition.name}`);
    return;
  }

  const bank = await prisma.questionBank.create({
    data: { name: definition.name, mockExamType: definition.exam },
  });

  for (const section of definition.sections) {
    for (let index = 1; index <= section.count; index += 1) {
      const text = questionText(definition.name, section.subject, index);
      const correctText = String(index * 2);
      await prisma.question.create({
        data: {
          sourceType: QuestionSourceType.MANUAL,
          questionBankId: bank.id,
          questionText: text,
          textBeforeImage: text,
          textAfterImage: '',
          imagePath: '',
          topic: section.subject,
          answerType: section.answerType,
          correctOptionKey: section.answerType === QuestionAnswerType.OPTIONS ? 'A' : null,
          correctTextAnswer: section.answerType === QuestionAnswerType.TEXT ? correctText : null,
          verificationStatus: VerificationStatus.APPROVED,
          finalApproved: true,
          options: section.answerType === QuestionAnswerType.OPTIONS ? {
            create: [
              { optionKey: 'A', content: subjectOption(section.subject, index, 'correct'), sortOrder: 1 },
              { optionKey: 'B', content: subjectOption(section.subject, index, 'one'), sortOrder: 2 },
              { optionKey: 'C', content: subjectOption(section.subject, index, 'two'), sortOrder: 3 },
              { optionKey: 'D', content: subjectOption(section.subject, index, 'three'), sortOrder: 4 },
            ],
          } : undefined,
          contentBlocks: { create: [{ blockType: ContentBlockType.TEXT, textContent: text, sortOrder: 1 }] },
        },
      });
    }
  }
  console.log(`Created ${definition.name}`);
}

function subjectOption(subject: string, index: number, variant: 'correct' | 'one' | 'two' | 'three') {
  if (subject.includes('QA')) {
    const offsets = { correct: 0, one: 1, two: 2, three: 3 };
    return String((index * 2) + offsets[variant]);
  }
  const options = {
    correct: 'The statement is correct.',
    one: 'The statement is incomplete.',
    two: 'The statement is unrelated.',
    three: 'The statement is incorrect.',
  };
  return options[variant];
}

for (const bank of banks) {
  await createBank(bank);
}

await prisma.$disconnect();
