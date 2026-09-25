import { normalizeText } from './contentBlocks';

type Groupable = {
  paragraph?: string | null;
  imagePath?: string | null;
};

export type QuestionGroup<T> = {
  key: string;
  paragraph: string | null;
  imagePath: string | null;
  questions: T[];
};

function groupSignature(question: Groupable): string {
  const paragraph = normalizeText(question.paragraph || '');
  const imagePath = (question.imagePath || '').trim();
  if (!paragraph && !imagePath) {
    return '';
  }
  return `${paragraph}\u0000${imagePath}`;
}

export function groupQuestionsByParagraph<T extends Groupable>(questions: T[]): QuestionGroup<T>[] {
  const groups: QuestionGroup<T>[] = [];
  const indexBySignature = new Map<string, number>();

  for (const question of questions) {
    const signature = groupSignature(question);
    if (!signature) {
      groups.push({ key: `solo-${groups.length}`, paragraph: null, imagePath: null, questions: [question] });
      continue;
    }

    const existingIndex = indexBySignature.get(signature);
    if (existingIndex === undefined) {
      indexBySignature.set(signature, groups.length);
      groups.push({
        key: signature,
        paragraph: question.paragraph || null,
        imagePath: question.imagePath || null,
        questions: [question],
      });
    } else {
      groups[existingIndex].questions.push(question);
    }
  }

  return groups;
}
