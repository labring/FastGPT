import React from 'react';
import { Box, type BoxProps } from '@chakra-ui/react';

const DebugToolTag = React.memo(function DebugToolTag(props: BoxProps) {
  return (
    <Box
      flexShrink={0}
      px={2}
      py={0.5}
      borderRadius={'6px'}
      bg={'rgba(255, 245, 204, 1)'}
      color={'rgba(227, 72, 49, 1)'}
      border={'1px solid rgba(247, 214, 118, 1)'}
      fontSize={'11px'}
      fontWeight={'500'}
      lineHeight={'16px'}
      {...props}
    >
      调试
    </Box>
  );
});

export default DebugToolTag;
