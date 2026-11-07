import React from 'react';
import { Box, Flex } from '@chakra-ui/react';

/** 沿用示例 HTML 的单元素与伪元素闪烁动画，小号为 8px，大号为 12px。 */
const DotLoading = ({ size = 'sm' }: { size?: 'sm' | 'lg' }) => {
  const dotSize = size === 'lg' ? 12 : 8;

  return (
    <Flex
      aria-hidden="true"
      alignItems={'center'}
      justifyContent={'center'}
      w={`${dotSize * 4}px`}
      minH={'24px'}
      flexShrink={0}
    >
      <Box
        sx={{
          '--loader-color': '#2563EB',
          '--size': `${dotSize}px`,
          '--gap': `${dotSize * 1.5}px`,
          '--duration': '0.6s',
          position: 'relative',
          width: 'var(--size)',
          height: 'var(--size)',
          borderRadius: '50%',
          background: 'var(--loader-color)',
          color: 'var(--loader-color)',
          animation: 'dot-loading-flash var(--duration) infinite linear alternate',
          animationDelay: 'calc(var(--duration) / 2)',
          '&::before, &::after': {
            content: '""',
            display: 'inline-block',
            position: 'absolute',
            top: 0,
            width: 'var(--size)',
            height: 'var(--size)',
            borderRadius: '50%',
            background: 'var(--loader-color)'
          },
          '&::before': {
            left: 'calc(var(--gap) * -1)',
            animation: 'dot-loading-flash var(--duration) infinite alternate',
            animationDelay: '0s'
          },
          '&::after': {
            left: 'var(--gap)',
            animation: 'dot-loading-flash var(--duration) infinite alternate',
            animationDelay: 'var(--duration)'
          },
          '@keyframes dot-loading-flash': {
            '0%': { backgroundColor: 'var(--loader-color)' },
            '50%, 100%': {
              backgroundColor: 'color-mix(in srgb, var(--loader-color) 20%, transparent)'
            }
          },
          '@media (prefers-reduced-motion: reduce)': {
            '&, &::before, &::after': { animation: 'none' }
          }
        }}
      />
    </Flex>
  );
};

export default React.memo(DotLoading);
