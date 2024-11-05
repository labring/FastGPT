import React, { useEffect, useRef, useCallback, useState } from 'react';
import { Box } from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';

const MermaidBlock = ({ code }: { code: string }) => {
  return (
    <Box w={'100%'}>
      <iframe
        src={code}
        style={{
          width: '100%',
          height: '100%',
          minHeight: '40vh',
          border: 'none'
        }}
      />
    </Box>
  );
};

export default MermaidBlock;
