import React from 'react';
import { Image } from '@chakra-ui/react';
import type { ImageProps } from '@chakra-ui/react';

const Avatar = ({ w = '30px', src, ...props }: ImageProps) => {
  return (
    <Image
      fallbackSrc={'/icon/logo.svg'}
      fallbackStrategy={'onError'}
      borderRadius={'md'}
      objectFit={'contain'}
      alt=""
      w={w}
      h={w}
      p={'1px'}
      src={src || '/icon/logo.svg'}
      {...props}
    />
  );
};

export default Avatar;
