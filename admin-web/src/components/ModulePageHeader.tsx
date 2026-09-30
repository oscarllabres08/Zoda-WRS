import { useEffect, useState } from 'react';

function formatNow() {
  const d = new Date();
  const date = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return `${date} | ${time}`;
}

type Props = {
  title: string;
  subtitle: string;
  branch?: string;
  tagline?: string;
};

export function ModulePageHeader({
  title,
  subtitle,
  branch = 'Zoda WRS Main Branch',
  tagline = 'Pure water for a healthier tomorrow',
}: Props) {
  const [now, setNow] = useState(formatNow);

  useEffect(() => {
    const id = window.setInterval(() => setNow(formatNow()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <header className="module-page-header">
      <div className="module-page-header-top">
        <div className="module-page-header-main">
          <h1>{title}</h1>
          <p>{subtitle}</p>
        </div>
        <div className="module-page-header-meta">
          <span className="module-meta-item">
            <CalendarIcon />
            {now}
          </span>
          <span className="module-meta-item">
            <PinIcon />
            {branch}
          </span>
        </div>
      </div>
      <p className="module-page-tagline">{tagline}</p>
    </header>
  );
}

function CalendarIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M7 3v2M17 3v2M4 9h16M5 7h14a1 1 0 011 1v12a1 1 0 01-1 1H5a1 1 0 01-1-1V8a1 1 0 011-1z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function PinIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 21s6-5.2 6-10a6 6 0 10-12 0c0 4.8 6 10 6 10z"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <circle cx="12" cy="11" r="2" fill="currentColor" />
    </svg>
  );
}
