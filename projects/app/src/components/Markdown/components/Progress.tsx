import React from 'react';
import {
  Progress as ChakraProgress,
  type ProgressProps as ChakraProgressProps
} from '@chakra-ui/react';

export type MarkdownProgressProps = {
  node?: any;
  value?: number | string;
  max?: number | string;
} & ChakraProgressProps;

/**
 * 基于 Chakra UI 的受控 Markdown <progress> 进度条渲染器
 */
export const Progress = ({ node, value = 0, max = 100, ...props }: MarkdownProgressProps) => {
  const numValue = Number(value) || 0;
  const numMax = Number(max) || 100;
  const percent = Math.min(Math.max((numValue / numMax) * 100, 0), 100);

  return (
    <ChakraProgress
      value={percent}
      size={'sm'}
      colorScheme={'primary'}
      borderRadius={'full'}
      bg={'myGray.200'}
      maxW={'100%'}
      my={2}
      {...props}
    />
  );
};

export default React.memo(Progress);
