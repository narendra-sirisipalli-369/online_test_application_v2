import type { CSSProperties } from 'react';
import type { Avatar } from '../types/app';

function hash(input: string) {
  let value = 0;
  for (let index = 0; index < input.length; index += 1) {
    value = (value * 33 + input.charCodeAt(index)) >>> 0;
  }
  return value;
}

function toHsl(hex: string) {
  const normalized = hex.replace('#', '');
  const value = normalized.length === 3
    ? normalized.split('').map((part) => part + part).join('')
    : normalized;

  const red = parseInt(value.slice(0, 2), 16) / 255;
  const green = parseInt(value.slice(2, 4), 16) / 255;
  const blue = parseInt(value.slice(4, 6), 16) / 255;

  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const lightness = (max + min) / 2;

  if (max === min) {
    return { h: 200, s: 70, l: 55 };
  }

  const diff = max - min;
  const saturation = lightness > 0.5 ? diff / (2 - max - min) : diff / (max + min);
  let hue = 0;

  switch (max) {
    case red:
      hue = (green - blue) / diff + (green < blue ? 6 : 0);
      break;
    case green:
      hue = (blue - red) / diff + 2;
      break;
    default:
      hue = (red - green) / diff + 4;
      break;
  }

  return {
    h: Math.round(hue * 60),
    s: Math.round(saturation * 100),
    l: Math.round(lightness * 100),
  };
}

export function getAlienDisplayName(input?: Avatar | null) {
  if (!input) return 'Alien Cadet';
  const titles = ['Nebula', 'Cosmo', 'Nova', 'Quasar', 'Orbit', 'Zenith'];
  const seed = hash(input.id);
  return `${titles[seed % titles.length]} ${input.name}`;
}

export function AlienAvatar({
  avatar,
  size = 'md',
}: {
  avatar?: Avatar | null;
  size?: 'sm' | 'md' | 'lg';
}) {
  const seed = hash(avatar?.id || avatar?.name || 'alien');
  const color = toHsl(avatar?.accentColor || '#5ebdff');
  const eyeShape = ['round', 'tilt', 'oval'][seed % 3];
  const antennaCount = (seed % 2) + 1;
  const mouthStyle = ['smile', 'flat', 'beam'][seed % 3];
  const style = {
    '--alien-hue': `${color.h}`,
    '--alien-sat': `${Math.max(color.s, 58)}%`,
    '--alien-light': `${Math.max(color.l, 46)}%`,
    '--alien-light-2': `${Math.min(color.l + 18, 82)}%`,
    '--alien-dark': `${Math.max(color.l - 28, 18)}%`,
  } as CSSProperties;

  return (
    <div
      aria-label={getAlienDisplayName(avatar)}
      className={`alien-avatar alien-avatar--${size}`}
      role="img"
      style={style}
      title={getAlienDisplayName(avatar)}
    >
      <div className="alien-avatar__shadow" />
      {Array.from({ length: antennaCount }).map((_, index) => (
        <div className={`alien-avatar__antenna alien-avatar__antenna--${index + 1}`} key={index} />
      ))}
      <div className="alien-avatar__helmet">
        <div className="alien-avatar__head">
          <div className="alien-avatar__spots" />
          <div className="alien-avatar__eyes">
            <span className={`alien-avatar__eye alien-avatar__eye--${eyeShape}`} />
            <span className={`alien-avatar__eye alien-avatar__eye--${eyeShape}`} />
          </div>
          <div className={`alien-avatar__mouth alien-avatar__mouth--${mouthStyle}`} />
        </div>
        <div className="alien-avatar__suit" />
      </div>
    </div>
  );
}
