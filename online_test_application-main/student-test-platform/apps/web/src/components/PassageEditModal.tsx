import { useRef, useState } from 'react';
import { ImagePlus } from 'lucide-react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { buildImageMarker, parseStructuredText } from '../utils/contentBlocks';
import { ContentBlockList } from './ContentBlockList';
import { Modal } from './Modal';

type Props = {
  initialParagraph: string;
  onClose: () => void;
  onSave: (paragraph: string) => Promise<void>;
};

export function PassageEditModal({ initialParagraph, onClose, onSave }: Props) {
  const { token } = useAuth();
  const [value, setValue] = useState(initialParagraph);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function handleUploadClick() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file || !token) return;
      setUploading(true);
      setError('');
      try {
        const response = await api.uploadImage(token, file);
        const marker = buildImageMarker(response.path);
        const textarea = textareaRef.current;
        const cursor = textarea?.selectionStart ?? value.length;
        setValue((current) => `${current.slice(0, cursor)}\n${marker}\n${current.slice(cursor)}`);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unable to upload image');
      } finally {
        setUploading(false);
      }
    };
    input.click();
  }

  async function handleSave() {
    setSaving(true);
    setError('');
    try {
      await onSave(value);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save passage');
      setSaving(false);
    }
  }

  const previewBlocks = parseStructuredText(value);

  return (
    <Modal
      actions={(
        <>
          <button className="ghost-button" onClick={onClose} type="button">Cancel</button>
          <button className="primary-button" disabled={saving} onClick={() => void handleSave()} type="button">
            {saving ? 'Updating…' : 'Update'}
          </button>
        </>
      )}
      onClose={onClose}
      size="lg"
      title="Edit passage"
    >
      {error ? <div className="error-banner" style={{ marginBottom: 12 }}>{error}</div> : null}

      <div className="passage-editor">
        <div className="passage-editor__toolbar">
          <button
            className="icon-button"
            disabled={uploading}
            onClick={handleUploadClick}
            title="Insert image at cursor"
            type="button"
          >
            <ImagePlus size={16} />
          </button>
          <span className="caption">
            {uploading ? 'Uploading…' : 'Place your cursor where the image should go, then click to upload'}
          </span>
        </div>
        <textarea
          className="passage-editor__textarea"
          onChange={(event) => setValue(event.target.value)}
          ref={textareaRef}
          rows={10}
          value={value}
        />
      </div>

      <div className="passage-editor__preview">
        <div className="question-card__context-label">Preview</div>
        <div className="question-card__content">
          <ContentBlockList blocks={previewBlocks} />
        </div>
      </div>
    </Modal>
  );
}
