import type { RenderBlock } from '../utils/contentBlocks';

export function ContentBlockList({ blocks }: { blocks: RenderBlock[] }) {
  return (
    <>
      {blocks.map((block, index) => {
        if (block.type === 'image') {
          return <img key={`${block.type}-${index}`} className="question-card__image" src={block.src} alt="Question asset" />;
        }

        if (block.type === 'table') {
          return (
            <div key={`${block.type}-${index}`} className="question-card__table-wrap">
              <table className="question-card__table">
                <tbody>
                  {block.rows.map((row, rowIndex) => (
                    <tr key={`row-${rowIndex}`}>
                      {row.map((cell, cellIndex) => {
                        const Tag = rowIndex === 0 ? 'th' : 'td';
                        return <Tag key={`cell-${rowIndex}-${cellIndex}`}>{cell}</Tag>;
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }

        return (
          <div key={`${block.type}-${index}`} className="question-card__block">
            <div className="question-card__text">{block.value}</div>
          </div>
        );
      })}
    </>
  );
}
