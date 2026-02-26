'use client';

import { useEffect } from 'react';
import { useLocalizedRouter } from '@/lib/localized-navigation';

interface RedirectProps {
  to: string;
}

export function Redirect({ to }: RedirectProps) {
  const router = useLocalizedRouter();

  useEffect(() => {
    router.push(to);
  }, [to, router]);

  return null;
}
