import { useEffect, useState } from 'react';

// Returns true when viewport width is below the given breakpoint (default 768px).
export function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(
    typeof window !== 'undefined' ? window.innerWidth < breakpoint : false
  );
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < breakpoint);
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [breakpoint]);
  return isMobile;
}

// Returns 'mobile' | 'tablet' | 'desktop' based on viewport width.
export function useScreenSize() {
  const [size, setSize] = useState<'mobile' | 'tablet' | 'desktop'>(
    typeof window !== 'undefined'
      ? window.innerWidth < 768
        ? 'mobile'
        : window.innerWidth < 1024
        ? 'tablet'
        : 'desktop'
      : 'desktop'
  );
  useEffect(() => {
    const onResize = () => {
      const w = window.innerWidth;
      setSize(w < 768 ? 'mobile' : w < 1024 ? 'tablet' : 'desktop');
    };
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return size;
}
