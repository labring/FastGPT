import React from 'react';
import { Image } from '@chakra-ui/react';
import type { ImageProps } from '@chakra-ui/react';
import { LOGO_ICON } from '@/constants/chat';

const Avatar = ({ w = '30px', ...props }: ImageProps) => {
  return (
    <Image
      fallbackSrc={LOGO_ICON}
      borderRadius={'50%'}
      objectFit={'cover'}
      alt=""
      w={w}
      h={w}
      p={'1px'}
      {...props}
    />
  );
};

export default Avatar;
