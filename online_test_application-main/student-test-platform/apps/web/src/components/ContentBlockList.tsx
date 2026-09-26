import type { RenderBlock } from '../utils/contentBlocks';
import { LatexText } from './LatexText';

export function ContentBlockList({ blocks }: { blocks: RenderBlock[] }) {
  return (
    <>
      {blocks.map((block, index) => {
        if (block.type === 'image') {
          return <img key={`${block.type}-${index}`} className="question-card__image" src={block.src} alt="Question asset" />;
        }

        if (block.type === 'table') {
          const [headerRow, ...bodyRows] = block.rows;
          return (
            <div key={`${block.type}-${index}`} className="question-card__table-wrap">
              <table className="question-card__table">
                {headerRow ? (
                  <thead>
                    <tr>
                      {headerRow.map((cell, cellIndex) => <th key={`head-${cellIndex}`} scope="col"><LatexText text={cell} /></th>)}
                    </tr>
                  </thead>
                ) : null}
                <tbody>
                  {bodyRows.map((row, rowIndex) => (
                    <tr key={`row-${rowIndex}`}>
                      {row.map((cell, cellIndex) => cellIndex === 0
                        ? <th key={`cell-${rowIndex}-${cellIndex}`} scope="row"><LatexText text={cell} /></th>
                        : <td key={`cell-${rowIndex}-${cellIndex}`}><LatexText text={cell} /></td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }

        return (
          <div key={`${block.type}-${index}`} className="question-card__block">
            <div className="question-card__text"><LatexText text={block.value} /></div>
          </div>
        );
      })}
    </>
  );
}
