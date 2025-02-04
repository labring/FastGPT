import React, { useEffect } from 'react';
import { Box } from '@chakra-ui/react';
import { useMarkdownWidth } from '../hooks';

const VideoBlock = ({ code: videoUrl }: { code: string }) => {
  const { width, Ref } = useMarkdownWidth();

  useEffect(() => {
    fetch(videoUrl?.trim(), {
      mode: 'cors',
      credentials: 'omit'
    })
      .then((response) => response.blob())
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        const video = document.getElementById('player');
        video?.setAttribute('src', url);
      })
      .catch((err) => {
        console.log(err);
      });
  }, [videoUrl]);

  return (
    <Box w={width} ref={Ref}>
      <video id="player" controls />
    </Box>
  );
};

export default VideoBlock;
