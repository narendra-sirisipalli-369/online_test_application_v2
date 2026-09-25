export type RenderBlock =
  | { type: 'text'; value: string }
  | { type: 'table'; rows: string[][] }
  | { type: 'image'; src: string };

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:4100';

export function resolveAssetUrl(path: string) {
  if (!path) {
    return '';
  }
  if (/^https?:\/\//i.test(path)) {
    return path;
  }
  return `${API_BASE}${path.startsWith('/') ? path : `/${path}`}`;
}

export function normalizeText(text: string) {
  return text.replace(/\s+/g, ' ').trim();
}

const IMAGE_MARKER_PREFIX = 'ImageMarker:(';

// Lets an admin insert an image inline at a specific point in a paragraph
// (rather than only ever after the whole passage), using the same
// text-marker approach already used for embedded tables.
export function buildImageMarker(path: string) {
  return `ImageMarker:(${path})`;
}

export function parseStructuredText(text: string): RenderBlock[] {
  if (!text.trim()) {
    return [];
  }

  const blocks: RenderBlock[] = [];
  let cursor = 0;

  function pushTail(from: number) {
    const tail = normalizeParagraph(text.slice(from));
    if (tail) {
      blocks.push({ type: 'text', value: tail });
    }
  }

  while (cursor < text.length) {
    const tableIndex = text.indexOf('TableJSON:', cursor);
    const imageIndex = text.indexOf(IMAGE_MARKER_PREFIX, cursor);

    let markerIndex = -1;
    let markerType: 'table' | 'image' = 'table';
    if (tableIndex !== -1 && (imageIndex === -1 || tableIndex < imageIndex)) {
      markerIndex = tableIndex;
      markerType = 'table';
    } else if (imageIndex !== -1) {
      markerIndex = imageIndex;
      markerType = 'image';
    }

    if (markerIndex === -1) {
      pushTail(cursor);
      break;
    }

    const before = normalizeParagraph(text.slice(cursor, markerIndex));
    if (before) {
      blocks.push({ type: 'text', value: before });
    }

    if (markerType === 'image') {
      const closeIndex = text.indexOf(')', markerIndex);
      if (closeIndex === -1) {
        pushTail(markerIndex);
        break;
      }
      const imagePath = text.slice(markerIndex + IMAGE_MARKER_PREFIX.length, closeIndex).trim();
      if (imagePath) {
        blocks.push({ type: 'image', src: resolveAssetUrl(imagePath) });
      }
      cursor = closeIndex + 1;
      continue;
    }

    const jsonStart = text.indexOf('{', markerIndex);
    if (jsonStart === -1) {
      pushTail(markerIndex);
      break;
    }

    const jsonEnd = findBalancedJsonEnd(text, jsonStart);
    if (jsonEnd === -1) {
      pushTail(markerIndex);
      break;
    }

    const tableBlock = buildTableBlock(text.slice(jsonStart, jsonEnd + 1));
    if (tableBlock) {
      blocks.push(tableBlock);
    }

    cursor = jsonEnd + 1;
  }

  return blocks;
}

function buildTableBlock(jsonText: string): RenderBlock | null {
  try {
    const parsed = JSON.parse(jsonText) as Record<string, string[][]>;
    const firstTable = Object.values(parsed)[0];
    if (!Array.isArray(firstTable) || !firstTable.length) {
      return null;
    }
    return {
      type: 'table',
      rows: firstTable.map((row) => row.map((cell) => String(cell ?? ''))),
    };
  } catch {
    return {
      type: 'text',
      value: `Table data\n${jsonText}`,
    };
  }
}

function normalizeParagraph(text: string) {
  // Extracted paragraphs carry the source document's own line-wrapping as
  // literal newlines (e.g. "...scale from 1 to\n9. If the total..."), which
  // has nothing to do with sentence/list structure. Collapse it all away
  // first so the line breaks we insert below are the only ones left.
  let collapsed = text
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  collapsed = collapsed
    .replace(/\s*\|\s*/g, ' ')
    .replace(/(Direction\s*\([^)]+\)\s*:\s*[^\n]+?below\.)\s+/gi, '$1\n\n')
    .replace(/(The following additional facts(?: are also)? known\.?)\s*/gi, '$1\n\n');

  collapsed = insertSequentialListBreaks(collapsed);

  return collapsed
    .replace(/\s+(?=[ivxlcdm]+\.\s)/gi, '\n')
    .replace(/\s+(?=(?:\([A-D]\))\s)/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
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
