import React from 'react';
import { Box } from '@chakra-ui/react';
import { useMarkdownWidth } from '../hooks';

const VideoBlock = ({ code: videoUrl }: { code: string }) => {
  const { width, Ref } = useMarkdownWidth();
  return (
    <Box w={width} ref={Ref}>
      <video src={videoUrl} controls />
    </Box>
  );
};

export default VideoBlock;
