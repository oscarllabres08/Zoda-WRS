import { useEffect, useRef, useState } from 'react';

type Props = {
  label?: string;
  hint?: string;
  disabled?: boolean;
  previewUrl?: string | null;
  onFileSelect: (file: File | null) => void;
};

export function ImageUploadField({ label = 'Product image', hint, disabled, previewUrl, onFileSelect }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [localPreview, setLocalPreview] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (localPreview?.startsWith('blob:')) URL.revokeObjectURL(localPreview);
    };
  }, [localPreview]);

  const shown = localPreview ?? previewUrl ?? null;

  function pick(file: File | undefined) {
    if (!file) return;
    if (localPreview?.startsWith('blob:')) URL.revokeObjectURL(localPreview);
    setLocalPreview(URL.createObjectURL(file));
    onFileSelect(file);
  }

  return (
    <div className="field">
      <label>{label}</label>
      {hint ? <p className="field-hint">{hint}</p> : null}
      <div
        className={`upload-zone${disabled ? ' disabled' : ''}`}
        role="button"
        tabIndex={0}
        onClick={() => !disabled && inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            if (!disabled) inputRef.current?.click();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          e.currentTarget.classList.add('drag-over');
        }}
        onDragLeave={(e) => e.currentTarget.classList.remove('drag-over')}
        onDrop={(e) => {
          e.preventDefault();
          e.currentTarget.classList.remove('drag-over');
          if (disabled) return;
          pick(e.dataTransfer.files?.[0]);
        }}
      >
        {shown ? (
          <img src={shown} alt="Product preview" className="upload-preview" />
        ) : (
          <div className="upload-placeholder">
            <span className="upload-icon" aria-hidden>
              📷
            </span>
            <span className="upload-title">Click to upload image or drag and drop</span>
            <span className="upload-sub">PNG, JPG, WebP — auto-compressed before upload</span>
          </div>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          hidden
          disabled={disabled}
          onChange={(e) => pick(e.target.files?.[0])}
        />
      </div>
      {shown ? (
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={disabled}
          onClick={() => {
            if (localPreview?.startsWith('blob:')) URL.revokeObjectURL(localPreview);
            setLocalPreview(null);
            onFileSelect(null);
            if (inputRef.current) inputRef.current.value = '';
          }}
        >
          Remove image
        </button>
      ) : null}
    </div>
  );
}
