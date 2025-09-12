import { useMarkdown } from '@/web/common/hooks/useMarkdown';
import { Box, Card } from '@chakra-ui/react';
import React from 'react';

const Empty = () => {
  return (
    <Box py={6} w={'85%'} maxW={'600px'} m={'auto'} alignItems={'center'} justifyContent={'center'}>
      {/* version intro */}
    </Box>
  );
};

export default React.memo(Empty);
