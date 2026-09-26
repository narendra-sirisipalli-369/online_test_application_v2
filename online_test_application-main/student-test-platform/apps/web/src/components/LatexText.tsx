import katex from 'katex';
import { splitLatexText, type LatexSegment } from '../utils/latex';

function MathFormula({ display, latex }: Extract<LatexSegment, { type: 'math' }>) {
  let html: string;
  try {
    html = katex.renderToString(latex, {
      displayMode: display,
      output: 'htmlAndMathml',
      strict: false,
      throwOnError: true,
      trust: false,
    });
  } catch {
    return <span className="latex-text__error">{display ? `$$${latex}$$` : `$${latex}$`}</span>;
  }

  return (
    <span
      className={display ? 'latex-text__formula latex-text__formula--display' : 'latex-text__formula'}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

export function LatexText({ className = '', text }: { className?: string; text: string }) {
  return (
    <span className={`latex-text ${className}`.trim()}>
      {splitLatexText(text).map((segment, index) => segment.type === 'text'
        ? <span key={`text-${index}`}>{segment.value}</span>
        : <MathFormula display={segment.display} key={`math-${index}`} latex={segment.latex} type="math" />)}
    </span>
  );
}
