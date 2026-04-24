// @file 背景装饰组件，用于在特定列表页右上角展示装饰图
import React from 'react';
import { Box } from '@chakra-ui/react';

const BgDecoration = () => {
  return (
    <Box
      position="absolute"
      top={0}
      right={0}
      width="100%"
      height="100%"
      overflow="hidden"
      pointerEvents="none"
      zIndex={0}
    >
      {/* 主装饰图 */}
      <Box
        as="img"
        src="/imgs/bg-decoration.png"
        position="absolute"
        w="787px"
        h="255px"
        top="0"
        right="0"
      />
    </Box>
  );
};

export default BgDecoration;
