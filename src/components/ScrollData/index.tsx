import React, { useRef, useEffect, useMemo } from 'react';
import type { BoxProps } from '@chakra-ui/react';
import { Box } from '@chakra-ui/react';
import { throttle } from 'lodash';
import { useLoading } from '@/hooks/useLoading';

interface Props extends BoxProps {
  nextPage: () => void;
  isLoadAll: boolean;
  requesting: boolean;
  children: React.ReactNode;
  initRequesting?: boolean;
}

const ScrollData = ({
  children,
  nextPage,
  isLoadAll,
  requesting,
  initRequesting,
  ...props
}: Props) => {
  const { Loading } = useLoading({ defaultLoading: true });
  const elementRef = useRef<HTMLDivElement>(null);
  const loadText = useMemo(() => {
    if (requesting) return '请求中……';
    if (isLoadAll) return '已加载全部';
    return '点击加载更多';
  }, [isLoadAll, requesting]);

  useEffect(() => {
    if (!elementRef.current) return;

    const scrolling = throttle((e: Event) => {
      const element = e.target as HTMLDivElement;
      if (!element) return;
      // 当前滚动位置
      const scrollTop = element.scrollTop;
      // 可视高度
      const clientHeight = element.clientHeight;
      // 内容总高度
      const scrollHeight = element.scrollHeight;
      // 判断是否滚动到底部
      if (scrollTop + clientHeight + 100 >= scrollHeight) {
        nextPage();
      }
    }, 100);
    elementRef.current.addEventListener('scroll', scrolling);
    return () => {
      // eslint-disable-next-line react-hooks/exhaustive-deps
      elementRef.current?.removeEventListener('scroll', scrolling);
    };
  }, [elementRef, nextPage]);

  return (
    <Box {...props} ref={elementRef} overflowY={'auto'} position={'relative'}>
      {children}
      <Box
        mt={2}
        fontSize={'xs'}
        color={'blackAlpha.500'}
        textAlign={'center'}
        cursor={loadText === '点击加载更多' ? 'pointer' : 'default'}
        onClick={() => {
          if (loadText !== '点击加载更多') return;
          nextPage();
        }}
      >
        {loadText}
      </Box>
      {initRequesting && <Loading fixed={false} />}
    </Box>
  );
};

export default ScrollData;
