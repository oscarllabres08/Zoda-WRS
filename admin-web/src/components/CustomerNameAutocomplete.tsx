import { useEffect, useId, useMemo, useRef, useState } from 'react';

import { publicWrsAssetUrl } from '../lib/format';
import { filterCustomerNameSuggestions, type PosCustomerOption } from '../lib/posCustomerNames';
import { supabase } from '../lib/supabase';

function highlightMatch(name: string, query: string): React.ReactNode {
  const q = query.trim();
  if (!q) return name;
  const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = name.match(new RegExp(escaped, 'i'));
  if (!match || match.index == null) return name;
  const idx = match.index;
  const len = match[0].length;
  return (
    <>
      {name.slice(0, idx)}
      <mark className="pos-customer-match">{name.slice(idx, idx + len)}</mark>
      {name.slice(idx + len)}
    </>
  );
}

type CustomerNameAutocompleteProps = {
  value: string;
  onChange: (value: string) => void;
  options: PosCustomerOption[];
  placeholder?: string;
  hint?: React.ReactNode;
  className?: string;
  disabled?: boolean;
};

export function CustomerNameAutocomplete({
  value,
  onChange,
  options,
  placeholder = 'e.g. Juan Dela Cruz',
  hint,
  className = '',
  disabled = false,
}: CustomerNameAutocompleteProps) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);

  const suggestions = useMemo(
    () => (open ? filterCustomerNameSuggestions(options, value) : []),
    [open, options, value]
  );

  useEffect(() => {
    setHighlight(suggestions.length > 0 ? 0 : -1);
  }, [suggestions]);

  function pick(option: PosCustomerOption) {
    onChange(option.name);
    setOpen(false);
    setHighlight(-1);
  }

  function onInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || suggestions.length === 0) {
      if (e.key === 'ArrowDown' && value.trim().length >= 1) setOpen(true);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight((i) => (i + 1) % suggestions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
    } else if (e.key === 'Enter' && highlight >= 0) {
      e.preventDefault();
      pick(suggestions[highlight]!);
    } else if (e.key === 'Escape') {
      setOpen(false);
      setHighlight(-1);
    }
  }

  return (
    <label className={`field pos-customer-field ${className}`.trim()}>
      <span className="pos-cash-label">Customer name</span>
      <div
        className={`pos-customer-autocomplete${open && suggestions.length > 0 ? ' pos-customer-autocomplete--open' : ''}`}
        ref={rootRef}
      >
        <input
          type="text"
          placeholder={placeholder}
          value={value}
          disabled={disabled}
          autoComplete="off"
          role="combobox"
          aria-expanded={open && suggestions.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            window.setTimeout(() => {
              if (!rootRef.current?.contains(document.activeElement)) {
                setOpen(false);
                setHighlight(-1);
              }
            }, 120);
          }}
          onKeyDown={onInputKeyDown}
        />
        {open && suggestions.length > 0 ? (
          <div className="pos-customer-suggestions-panel" role="presentation">
            <p className="pos-customer-suggestions-head">Existing customer — tap to select</p>
            <ul id={listId} className="pos-customer-suggestions" role="listbox">
              {suggestions.map((option, i) => {
                const avatarUrl = publicWrsAssetUrl(supabase, option.avatarPath);
                const initial = (option.name.trim()[0] ?? 'C').toUpperCase();
                return (
                  <li key={option.name} role="presentation">
                    <button
                      type="button"
                      role="option"
                      aria-selected={i === highlight}
                      className={`pos-customer-suggestion${i === highlight ? ' is-active' : ''}`}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => pick(option)}
                      onMouseEnter={() => setHighlight(i)}
                    >
                      <span className="pos-customer-suggestion-avatar" aria-hidden>
                        {avatarUrl ? (
                          <img src={avatarUrl} alt="" />
                        ) : (
                          <span className="pos-customer-suggestion-avatar-fallback">{initial}</span>
                        )}
                      </span>
                      <span className="pos-customer-suggestion-text">{highlightMatch(option.name, value)}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}
      </div>
      {hint}
    </label>
  );
}
