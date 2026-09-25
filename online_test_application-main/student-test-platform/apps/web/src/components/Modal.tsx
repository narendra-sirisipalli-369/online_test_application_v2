import { useEffect } from 'react';
import type { ReactNode } from 'react';

export function Modal({
  title,
  children,
  actions,
  onClose,
  size = 'md',
  tone = 'default',
}: {
  title: string;
  children: ReactNode;
  actions: ReactNode;
  onClose: () => void;
  size?: 'md' | 'lg';
  tone?: 'default' | 'space';
}) {
  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose();
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        aria-labelledby="modal-title"
        aria-modal="true"
        className={`modal-panel ${size === 'lg' ? 'modal-panel--lg' : ''} ${tone === 'space' ? 'modal-panel--space' : ''}`}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <h2 id="modal-title">{title}</h2>
        <div className="modal-panel__body">{children}</div>
        <div className="modal-panel__actions">{actions}</div>
      </div>
    </div>
  );
}
