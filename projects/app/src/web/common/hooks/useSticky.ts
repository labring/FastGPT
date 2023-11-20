import { useEffect, useRef, useState } from 'react';

export function useSticky(props?: { threshold?: number }) {
  const { threshold = 20 } = props || {};
  const parentRef = useRef<HTMLDivElement>(null);
  const divRef = useRef<HTMLDivElement>(null);
  const [isSticky, setIsSticky] = useState(false);

  useEffect(() => {
    const cb = () => {
      if (!divRef.current) return;
      const rect = divRef.current.getBoundingClientRect();
      const isSticky = rect.top <= threshold;
      setIsSticky(isSticky);
    };
    parentRef.current?.addEventListener('scroll', cb);

    return () => {
      parentRef.current?.removeEventListener('scroll', cb);
    };
  }, [threshold]);

  return {
    parentRef,
    divRef,
    isSticky
  };
}
