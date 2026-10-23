import React from 'react';
import { Spinner, Flex, Box, type SpinnerProps } from '@chakra-ui/react';
import DotLoading from './DotLoading';

export type LoadingVariant = 'spinner' | 'dots';

/** 在遮罩中展示圆环或三点加载动画，可选显示提示文字。 */
const Loading = ({
  fixed = true,
  text = '',
  bg = 'rgba(255,255,255,0.5)',
  zIndex = 1000,
  size = 'lg',
  variant = 'spinner'
}: {
  fixed?: boolean;
  text?: string;
  bg?: string;
  zIndex?: number;
  size?: SpinnerProps['size'];
  variant?: LoadingVariant;
}) => {
  return (
    <Flex
      position={fixed ? 'fixed' : 'absolute'}
      zIndex={fixed ? zIndex : 10}
      bg={bg}
      borderRadius={'md'}
      top={0}
      left={0}
      right={0}
      bottom={0}
      alignItems={'center'}
      justifyContent={'center'}
      flexDirection={'column'}
    >
      {variant === 'dots' ? (
        <DotLoading />
      ) : (
        <Spinner
          data-preserve-width
          flexShrink={0}
          thickness="4px"
          speed="0.65s"
          emptyColor="myGray.100"
          color="primary.500"
          size={size}
        />
      )}
      {text && (
        <Box
          mt={variant === 'dots' ? '20px' : 2}
          color={variant === 'dots' ? 'myGray.500' : 'primary.600'}
          fontSize={variant === 'dots' ? 'sm' : undefined}
          fontWeight={variant === 'dots' ? 'normal' : 'bold'}
        >
          {text}
        </Box>
      )}
    </Flex>
  );
};

export default React.memo(Loading);
