import React, { useEffect, useRef, useCallback, useState } from 'react';
import { Box } from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useMarkdownWidth } from '../hooks';

const MermaidBlock = ({ code }: { code: string }) => {
  const { width, Ref } = useMarkdownWidth();
  return (
    <Box w={width} ref={Ref}>
      <iframe
        src={code}
        sandbox="allow-scripts allow-forms allow-popups allow-downloads allow-presentation allow-storage-access-by-user-activation"
        referrerPolicy="no-referrer"
        style={{
          width: '100%',
          height: '100%',
          minHeight: '70vh',
          border: 'none'
        }}
      />
    </Box>
  );
};

export default MermaidBlock;
