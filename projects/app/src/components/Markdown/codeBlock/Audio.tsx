import React, { useEffect, useRef } from 'react';
import { Box } from '@chakra-ui/react';
import { useMarkdownWidth } from '../hooks';

const AudioBlock = ({ code: audioUrl }: { code: string }) => {
  const { width, Ref } = useMarkdownWidth();
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    fetch(audioUrl?.trim(), {
      mode: 'cors',
      credentials: 'omit'
    })
      .then((response) => response.blob())
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        audioRef?.current?.setAttribute('src', url);
      })
      .catch((err) => {
        console.log(err);
      });
  }, [audioUrl]);

  return (
    <Box w={width} ref={Ref} my={4}>
      <audio ref={audioRef} controls style={{ width: '100%' }} />
    </Box>
  );
};

export default AudioBlock;
