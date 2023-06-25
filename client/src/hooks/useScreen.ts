import { useMemo } from 'react';
import { useMediaQuery } from '@chakra-ui/react';

interface Props {
  defaultIsPc?: boolean;
}

export function useScreen(data?: Props) {
  const { defaultIsPc = false } = data || {};
  const [isPc] = useMediaQuery('(min-width: 900px)', {
    ssr: false,
    fallback: defaultIsPc
  });

  return {
    isPc,
    mediaLgMd: useMemo(() => (isPc ? 'lg' : 'md'), [isPc]),
    mediaMdSm: useMemo(() => (isPc ? 'md' : 'sm'), [isPc]),
    media: (pc: any, phone: any) => (isPc ? pc : phone)
  };
}
