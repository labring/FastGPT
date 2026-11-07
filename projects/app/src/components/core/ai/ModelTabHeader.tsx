import { Box, Flex, type FlexProps } from '@chakra-ui/react';
import type React from 'react';

type ModelTabHeaderProps = FlexProps & {
  Tab: React.ReactNode;
  children?: React.ReactNode;
};

/**
 * 模型管理各子页共用的一级 tabs 头部。
 * 移动端让 tabs 独占一行、操作区换到下一行；桌面端保持左右同排。
 */
const ModelTabHeader = ({ Tab, children, ...props }: ModelTabHeaderProps) => {
  return (
    <Flex
      px={6}
      alignItems={['stretch', 'center']}
      flexDirection={['column', 'row']}
      gap={[3, 0]}
      {...props}
    >
      <Box w={['100%', 'auto']}>{Tab}</Box>
      {children && (
        <Flex
          ml={[0, 'auto']}
          w={['100%', 'auto']}
          alignItems={'center'}
          justifyContent={['flex-start', 'flex-end']}
          flexWrap={'wrap'}
          gap={2}
        >
          {children}
        </Flex>
      )}
    </Flex>
  );
};

export default ModelTabHeader;
