import type { DetailedHTMLProps, HTMLAttributes } from 'react';

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'model-viewer': DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement> & {
        src?: string;
        poster?: string;
        alt?: string;
        ar?: boolean;
        'auto-rotate'?: boolean;
        'auto-rotate-delay'?: string;
        'camera-controls'?: boolean;
        'disable-pan'?: boolean;
        'disable-tap'?: boolean;
        'interaction-prompt'?: string;
        'shadow-intensity'?: string;
      };
    }
  }
}

export {};
