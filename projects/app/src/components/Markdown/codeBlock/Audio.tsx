import React, { useEffect } from 'react';
import { Box } from '@chakra-ui/react';
import { useMarkdownWidth } from '../hooks';

const AudioBlock = ({ code: audioUrl }: { code: string }) => {
  const { width, Ref } = useMarkdownWidth();

  useEffect(() => {
    fetch(audioUrl?.trim(), {
      mode: 'cors',
      credentials: 'omit'
    })
      .then((response) => response.blob())
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        const audio = document.getElementById('player');
        audio?.setAttribute('src', url);
      })
      .catch((err) => {
        console.log(err);
      });
  }, [audioUrl]);

  return (
    <Box w={width} ref={Ref}>
      <audio id="player" controls style={{ width: '100%' }} />
    </Box>
  );
};

export default AudioBlock;
