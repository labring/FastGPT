import React from 'react';
import { Box } from '@chakra-ui/react';
import { useMarkdownWidth } from '../hooks';

interface IframeBlockProps {
  code: string;
  sandbox?: string;
}

const IframeBlock = ({ code, sandbox }: IframeBlockProps) => {
  const { width, Ref } = useMarkdownWidth();
  return (
    <Box w={width} ref={Ref}>
      <iframe
        src={code}
        sandbox={
          sandbox ||
          'allow-scripts allow-forms allow-popups allow-downloads allow-presentation allow-storage-access-by-user-activation'
        }
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

export default IframeBlock;
