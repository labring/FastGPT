import { useMemo } from 'react';
import { useMediaQuery } from '@chakra-ui/react';

export function useScreen() {
  const [isPc] = useMediaQuery('(min-width: 900px)', {
    ssr: true,
    fallback: false
  });

  return {
    isPc,
    mediaLgMd: useMemo(() => (isPc ? 'lg' : 'md'), [isPc]),
    mediaMdSm: useMemo(() => (isPc ? 'md' : 'sm'), [isPc]),
    media: (pc: number | string, phone: number | string) => (isPc ? pc : phone)
  };
}
