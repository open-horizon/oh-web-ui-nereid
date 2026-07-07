import { useEffect, useRef } from 'react';

export function usePolling(callback: () => void, intervalMs: number) {
  const savedCallback = useRef(callback);
  savedCallback.current = callback;

  useEffect(() => {
    const id = setInterval(() => {
      savedCallback.current();
    }, intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
}
