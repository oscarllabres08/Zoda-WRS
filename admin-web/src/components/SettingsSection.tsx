import { useState, type ReactNode } from 'react';

type Props = {
  title: string;
  subtitle: string;
  icon?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
};

export function SettingsSection({ title, subtitle, icon, defaultOpen = false, children }: Props) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className={`settings-section${open ? ' settings-section--open' : ''}`}>
      <button
        type="button"
        className="settings-section-trigger"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="settings-section-trigger-main">
          {icon ? <span className="settings-section-icon">{icon}</span> : null}
          <span className="settings-section-titles">
            <strong>{title}</strong>
            <span>{subtitle}</span>
          </span>
        </span>
        <span className="settings-section-chevron" aria-hidden />
      </button>
      {open ? <div className="settings-section-body">{children}</div> : null}
    </section>
  );
}
