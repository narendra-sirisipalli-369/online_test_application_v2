import { ContentBlockList } from './ContentBlockList';
import { parseStructuredText, resolveAssetUrl, type RenderBlock } from '../utils/contentBlocks';

type Props = {
  paragraph?: string | null;
  imagePath?: string | null;
  bare?: boolean;
};

export function ParagraphGroupCard({ paragraph, imagePath, bare }: Props) {
  const blocks: RenderBlock[] = [
    ...parseStructuredText(paragraph || ''),
    ...(imagePath ? [{ type: 'image', src: resolveAssetUrl(imagePath) } satisfies RenderBlock] : []),
  ];

  if (!blocks.length) {
    return null;
  }

  if (bare) {
    return (
      <div className="question-group__passage">
        <div className="eyebrow">Shared passage</div>
        <div className="question-card__content">
          <ContentBlockList blocks={blocks} />
        </div>
      </div>
    );
  }

  return (
    <article className="question-card question-card--shared">
      <div className="eyebrow">Shared passage</div>
      <div className="question-card__content">
        <ContentBlockList blocks={blocks} />
      </div>
    </article>
  );
}
