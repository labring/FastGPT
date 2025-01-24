import React from 'react';
import { Box } from '@chakra-ui/react';
import { useMarkdownWidth } from '../hooks';

const AudioBlock = ({ code: audioUrl }: { code: string }) => {
  const { width, Ref } = useMarkdownWidth();
  return (
    <Box w={width} ref={Ref}>
      <audio src={audioUrl} controls />
    </Box>
  );
};

export default AudioBlock;
