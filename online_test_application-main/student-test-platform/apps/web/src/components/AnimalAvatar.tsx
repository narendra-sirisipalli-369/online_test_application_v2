import { resolveAssetUrl } from '../utils/contentBlocks';
import type { Avatar } from '../types/app';

export function AnimalAvatar({
  avatar,
  size = 'md',
}: {
  avatar?: Avatar | null;
  size?: 'sm' | 'md' | 'lg';
}) {
  return (
    <span className={`animal-avatar animal-avatar--${size}`}>
      <span className="animal-avatar__shell">
        {avatar?.imageUrl ? (
          <img alt={avatar.name} className="animal-avatar__image" src={resolveAssetUrl(avatar.imageUrl)} />
        ) : (
          <span className="animal-avatar__fallback">?</span>
        )}
      </span>
    </span>
  );
}
