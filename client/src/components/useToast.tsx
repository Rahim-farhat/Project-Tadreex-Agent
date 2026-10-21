'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

type ToastKind = 'success' | 'error' | 'info';

/** Minimal toast: `const { toast, Toast } = useToast()` then render `<Toast />`. */
export function useToast() {
  const [state, setState] = useState<{ text: string; kind: ToastKind } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const toast = useCallback((text: string, kind: ToastKind = 'success') => {
    if (timer.current) clearTimeout(timer.current);
    setState({ text, kind });
    timer.current = setTimeout(() => setState(null), 2600);
  }, []);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const Toast = useCallback(
    () =>
      state ? (
        <div className="toast" data-kind={state.kind} role="status" aria-live="polite">
          {state.text}
        </div>
      ) : null,
    [state],
  );

  return { toast, Toast };
}
