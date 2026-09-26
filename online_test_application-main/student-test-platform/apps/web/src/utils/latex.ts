export type LatexSegment =
  | { type: 'math'; display: boolean; latex: string }
  | { type: 'text'; value: string };

type Delimiter = {
  close: string;
  display: boolean;
  open: string;
};

const DELIMITERS: Delimiter[] = [
  { open: '$$', close: '$$', display: true },
  { open: '\\[', close: '\\]', display: true },
  { open: '\\(', close: '\\)', display: false },
  { open: '$', close: '$', display: false },
];

function isEscaped(text: string, index: number) {
  let slashCount = 0;
  for (let cursor = index - 1; cursor >= 0 && text[cursor] === '\\'; cursor -= 1) slashCount += 1;
  return slashCount % 2 === 1;
}

function delimiterAt(text: string, index: number) {
  return DELIMITERS.find((delimiter) => {
    if (!text.startsWith(delimiter.open, index) || isEscaped(text, index)) return false;
    if (delimiter.open === '$' && (text[index + 1] === '$' || /\s/.test(text[index + 1] || ''))) return false;
    return true;
  });
}

function findClosingDelimiter(text: string, from: number, delimiter: Delimiter) {
  for (let index = from; index <= text.length - delimiter.close.length; index += 1) {
    if (!text.startsWith(delimiter.close, index) || isEscaped(text, index)) continue;
    if (delimiter.close === '$' && text[index + 1] === '$') continue;
    return index;
  }
  return -1;
}

export function splitLatexText(text: string): LatexSegment[] {
  const segments: LatexSegment[] = [];
  let plainStart = 0;
  let cursor = 0;

  while (cursor < text.length) {
    const delimiter = delimiterAt(text, cursor);
    if (!delimiter) {
      cursor += 1;
      continue;
    }

    const contentStart = cursor + delimiter.open.length;
    const closeIndex = findClosingDelimiter(text, contentStart, delimiter);
    if (closeIndex === -1) {
      cursor += delimiter.open.length;
      continue;
    }

    const latex = text.slice(contentStart, closeIndex).trim();
    if (!latex) {
      cursor = closeIndex + delimiter.close.length;
      continue;
    }

    if (cursor > plainStart) {
      segments.push({ type: 'text', value: text.slice(plainStart, cursor).replace(/\\\$/g, '$') });
    }
    segments.push({ type: 'math', latex, display: delimiter.display });
    cursor = closeIndex + delimiter.close.length;
    plainStart = cursor;
  }

  if (plainStart < text.length) {
    segments.push({ type: 'text', value: text.slice(plainStart).replace(/\\\$/g, '$') });
  }

  return segments.length ? segments : [{ type: 'text', value: text.replace(/\\\$/g, '$') }];
}
