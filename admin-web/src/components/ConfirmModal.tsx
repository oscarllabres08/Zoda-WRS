import type { ReactNode } from 'react';

type ConfirmModalProps = {
  open: boolean;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'primary';
  busy?: boolean;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
};

export function ConfirmModal({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'primary',
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  if (!open) return null;

  const confirmClass = variant === 'danger' ? 'btn btn-danger btn-sm' : 'btn btn-primary btn-sm';

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onClick={() => {
        if (!busy) onCancel();
      }}
    >
      <div
        className="modal-card confirm-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="confirm-modal-body">
          <div className={`confirm-modal-head${variant === 'danger' ? ' confirm-modal-head--danger' : ''}`}>
            {variant === 'danger' ? (
              <span className="confirm-modal-icon" aria-hidden>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M12 9v4M12 17h.01M10.3 4.5h3.4L20 19H4L10.3 4.5z"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
            ) : null}
            <div className="confirm-modal-head-text">
              <h2 id="confirm-modal-title" className="confirm-modal-title">
                {title}
              </h2>
              <div className="confirm-modal-message">{message}</div>
            </div>
          </div>
        </div>
        <div className="confirm-modal-actions">
          <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={onCancel}>
            {cancelLabel}
          </button>
          <button type="button" className={confirmClass} disabled={busy} onClick={() => void onConfirm()}>
            {busy ? 'Please wait…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
