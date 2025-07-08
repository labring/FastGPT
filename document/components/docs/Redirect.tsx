'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface RedirectProps {
  to: string;
}

export function Redirect({ to }: RedirectProps) {
  const router = useRouter();

  useEffect(() => {
    router.push(to);
  }, [to, router]);

  return null;
}
