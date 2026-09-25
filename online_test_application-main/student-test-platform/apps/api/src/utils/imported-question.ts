import { ContentBlockType } from '@prisma/client';

type ImportedQuestionLike = {
  paragraph?: string;
  question?: string;
  imageUrl?: string;
};

type ContentBlockInput = {
  blockType: ContentBlockType;
  textContent: string | null;
  imagePath: string | null;
  sortOrder: number;
};

export function formatImportedText(rawText: string | undefined | null) {
  if (!rawText) {
    return '';
  }

  // Extracted text carries the source document's own line-wrapping as
  // literal newlines (e.g. "...scale from 1 to\n9. If the total..."), which
  // has nothing to do with sentence/list structure. Collapse it away first
  // so the only line breaks left are the ones we insert below. Skip this for
  // text containing an embedded TableJSON blob, since collapsing/reflowing
  // could land a stray newline inside the JSON string and break parsing.
  const hasTableJson = /TableJSON:/.test(rawText);
  let text = hasTableJson
    ? rawText.replace(/\u00a0/g, ' ')
    : rawText.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();

  text = text.replace(/\s*\|\s*/g, ' ');
  text = text.replace(/\s+(TableJSON:)/g, '\n\n$1');
  text = text.replace(/(Direction\s*\([^)]+\)\s*:\s*[^\n]+?below\.)\s+/gi, '$1\n\n');
  text = text.replace(/(The following additional facts(?: are also)? known\.?)\s*/gi, '$1\n\n');
  text = hasTableJson
    ? text.replace(/\s+(?=(?:\d+|[ivxlcdm]+)\.\s)/gi, '\n')
    : insertSequentialListBreaks(text).replace(/\s+(?=[ivxlcdm]+\.\s)/gi, '\n');
  text = text.replace(/\s+(?=(?:\([A-D]\))\s)/g, '\n');
  text = text.replace(/[ \t]+\n/g, '\n');
  text = text.replace(/\n{3,}/g, '\n\n');
  return text.trim();
}

// A plain regex for "N. " matches any number-dot-space in prose (e.g. the "9."
// in "scale from 1 to 9."), not just genuine list markers. Only break before
// a match when it continues the strict 1, 2, 3, ... sequence a real list uses.
function insertSequentialListBreaks(text: string) {
  let nextExpected = 1;
  return text.replace(/(\d+)\.(\s)/g, (match, num: string, spacing: string) => {
    if (Number(num) === nextExpected) {
      nextExpected += 1;
      return `\n${num}.${spacing}`;
    }
    return match;
  });
}

export function buildImportedContentBlocks(question: ImportedQuestionLike): ContentBlockInput[] {
  const blocks: ContentBlockInput[] = [];
  let sortOrder = 1;

  const normalizedParagraph = formatImportedText(question.paragraph);
  for (const part of splitStructuredText(normalizedParagraph)) {
    blocks.push({
      blockType: ContentBlockType.TEXT,
      textContent: part,
      imagePath: null,
      sortOrder: sortOrder++,
    });
  }

  if (question.imageUrl) {
    blocks.push({
      blockType: ContentBlockType.IMAGE,
      textContent: null,
      imagePath: question.imageUrl,
      sortOrder: sortOrder++,
    });
  }

  return blocks;
}

function splitStructuredText(text: string) {
  if (!text) {
    return [];
  }

  const parts: string[] = [];
  let cursor = 0;

  while (cursor < text.length) {
    const markerIndex = text.indexOf('TableJSON:', cursor);
    if (markerIndex === -1) {
      const tail = text.slice(cursor).trim();
      if (tail) {
        parts.push(tail);
      }
      break;
    }

    const before = text.slice(cursor, markerIndex).trim();
    if (before) {
      parts.push(before);
    }

    const jsonStart = text.indexOf('{', markerIndex);
    if (jsonStart === -1) {
      const tail = text.slice(markerIndex).trim();
      if (tail) {
        parts.push(tail);
      }
      break;
    }

    const jsonEnd = findBalancedJsonEnd(text, jsonStart);
    if (jsonEnd === -1) {
      const tail = text.slice(markerIndex).trim();
      if (tail) {
        parts.push(tail);
      }
      break;
    }

    parts.push(text.slice(markerIndex, jsonEnd + 1).trim());
    cursor = jsonEnd + 1;
  }

  return parts;
}

function findBalancedJsonEnd(text: string, startIndex: number) {
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = startIndex; index < text.length; index += 1) {
    const char = text[index];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === '\\') {
      escaped = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (inString) {
      continue;
    }

    if (char === '{') {
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }

  return -1;
}
