import { useEffect, useMemo, useState } from 'react';
import type { Question } from '../types/app';
import type { QuestionGroup } from '../utils/questionGroups';

export type QuestionPage<T> = {
  key: string;
  groups: QuestionGroup<T>[];
  questions: T[];
};

function getViewport() {
  if (typeof window === 'undefined') return { width: 0, height: 0 };
  return { width: window.innerWidth, height: window.innerHeight };
}

function screenCapacity(viewport: { width: number; height: number }, hasSidebar: boolean) {
  const twoColumnWidth = hasSidebar ? 1180 : 920;
  const threeColumnWidth = hasSidebar ? 1800 : 1580;
  if (viewport.width >= threeColumnWidth && viewport.height >= 760) return 3;
  if (viewport.width >= twoColumnWidth && viewport.height >= 650) return 2;
  return 1;
}

function questionSize(question: Question, capacity: number) {
  const optionLength = question.options.reduce((total, option) => total + option.content.length, 0);
  const contentLength = question.questionText.length + optionLength + (question.textAfterImage?.length || 0);
  const hasRichContent = Boolean(
    question.imagePath
    || question.contentBlocks.some((block) => block.blockType === 'IMAGE')
    || question.questionText.includes('TableJSON:'),
  );

  if (hasRichContent || contentLength > 720) return capacity;
  if (contentLength > 360) return Math.min(2, capacity);
  return 1;
}

export function useQuestionPages<T extends Question>(groups: QuestionGroup<T>[], hasSidebar = false) {
  const [viewport, setViewport] = useState(getViewport);
  const capacity = screenCapacity(viewport, hasSidebar);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => setViewport(getViewport()));
    };
    window.addEventListener('resize', update);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', update);
    };
  }, []);

  return useMemo(() => {
    const pages: QuestionPage<T>[] = [];
    let pendingGroups: QuestionGroup<T>[] = [];
    let usedSpace = 0;

    const flush = () => {
      if (!pendingGroups.length) return;
      pages.push({
        key: pendingGroups.map((group) => group.key).join('|'),
        groups: pendingGroups,
        questions: pendingGroups.flatMap((group) => group.questions),
      });
      pendingGroups = [];
      usedSpace = 0;
    };

    for (const group of groups) {
      const hasSharedContext = Boolean(group.paragraph || group.imagePath || group.questions.length > 1);
      if (hasSharedContext) {
        flush();
        pages.push({ key: group.key, groups: [group], questions: group.questions });
        continue;
      }

      const requiredSpace = questionSize(group.questions[0], capacity);
      if (pendingGroups.length && usedSpace + requiredSpace > capacity) flush();
      pendingGroups.push(group);
      usedSpace += requiredSpace;
      if (usedSpace >= capacity) flush();
    }
    flush();
    return pages;
  }, [capacity, groups]);
}
