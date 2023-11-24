import React from 'react';
import { Image } from '@chakra-ui/react';
import type { ImageProps } from '@chakra-ui/react';
import { LOGO_ICON } from '@fastgpt/global/core/chat/constants';

const Avatar = ({ w = '30px', src, ...props }: ImageProps) => {
  return (
    <Image
      fallbackSrc={LOGO_ICON}
      fallbackStrategy={'onError'}
      borderRadius={'md'}
      objectFit={'contain'}
      alt=""
      w={w}
      h={w}
      p={'1px'}
      src={src || LOGO_ICON}
      {...props}
    />
  );
};

export default Avatar;
