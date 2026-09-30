import { useMemo, useState } from 'react';

import {
  containerLabelsForCustomer,
  joinContainerIds,
  parseContainerIds,
  recordContainerReturn,
} from '../lib/containerReturn';
import { supabase } from '../lib/supabase';

type Props = {
  customerId: string;
  customerName: string;
  outstanding: number;
  identifierNotes: string | null;
  busy: boolean;
  onBusyChange: (busy: boolean) => void;
  onSuccess: () => void;
  onError: (message: string) => void;
};

export function ContainerReturnPanel({
  customerId,
  outstanding,
  identifierNotes,
  busy,
  onBusyChange,
  onSuccess,
  onError,
}: Props) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set());

  const parsedIds = useMemo(() => parseContainerIds(identifierNotes), [identifierNotes]);
  const labels = useMemo(
    () => containerLabelsForCustomer(identifierNotes, outstanding),
    [identifierNotes, outstanding]
  );
  const hasNumberedIds = parsedIds.length > 0;

  if (outstanding < 1) return <>—</>;

  function toggle(label: string) {
    if (busy) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  }

  async function runReturn(quantity: number, labelsToReturn: string[]) {
    if (busy || quantity < 1) return;

    let containerNumbers: string | null = null;
    if (hasNumberedIds && labelsToReturn.length > 0) {
      const real = labelsToReturn.filter((l) => !l.startsWith('#'));
      if (real.length > 0) containerNumbers = joinContainerIds(real);
    }

    onBusyChange(true);
    onError('');
    try {
      const result = await recordContainerReturn(supabase, {
        customerId,
        quantity,
        containerNumbers,
      });

      if (!result.ok) {
        onError(result.message);
        return;
      }
      setSelected(new Set());
      onSuccess();
    } finally {
      onBusyChange(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-start', maxWidth: 220 }}>
      <span className="chip pending">{outstanding} borrowed</span>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {labels.map((label) => {
          const isOn = selected.has(label);
          return (
            <button
              key={label}
              type="button"
              className={isOn ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm'}
              disabled={busy}
              onClick={() => toggle(label)}
            >
              {isOn ? '☑ ' : '☐ '}
              {label}
            </button>
          );
        })}
      </div>
      {selected.size > 0 ? (
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={busy}
          onClick={() => void runReturn(selected.size, Array.from(selected))}
        >
          {busy ? 'Saving…' : `Return selected (${selected.size})`}
        </button>
      ) : null}
      <button
        type="button"
        className={selected.size > 0 ? 'btn btn-ghost btn-sm' : 'btn btn-primary btn-sm'}
        disabled={busy}
        onClick={() => void runReturn(outstanding, labels)}
      >
        {busy ? 'Saving…' : 'Returned all'}
      </button>
    </div>
  );
}
