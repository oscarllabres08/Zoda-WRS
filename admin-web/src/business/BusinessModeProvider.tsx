import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

export type BusinessMode = 'wrs' | 'laundry';

const STORAGE_KEY = 'zoda-admin-business-mode';

type Ctx = {
  mode: BusinessMode;
  setMode: (mode: BusinessMode) => void;
  isLaundry: boolean;
  isWrs: boolean;
};

const BusinessModeContext = createContext<Ctx | null>(null);

function readStoredMode(): BusinessMode {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'laundry' ? 'laundry' : 'wrs';
  } catch {
    return 'wrs';
  }
}

export function BusinessModeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<BusinessMode>(() => readStoredMode());

  const setMode = useCallback((next: BusinessMode) => {
    setModeState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
  }, []);

  const value = useMemo(
    () => ({
      mode,
      setMode,
      isLaundry: mode === 'laundry',
      isWrs: mode === 'wrs',
    }),
    [mode, setMode]
  );

  return <BusinessModeContext.Provider value={value}>{children}</BusinessModeContext.Provider>;
}

export function useBusinessMode(): Ctx {
  const ctx = useContext(BusinessModeContext);
  if (!ctx) throw new Error('useBusinessMode must be used within BusinessModeProvider');
  return ctx;
}
