import React from 'react';
import { Box, Flex, Image } from '@chakra-ui/react';
import type { ImageProps } from '@chakra-ui/react';
import { LOGO_ICON } from '@fastgpt/global/common/system/constants';
import MyIcon from '../Icon';
import { iconPaths } from '../Icon/constants';

const Avatar = ({ w = '30px', src, ...props }: ImageProps) => {
  // @ts-ignore
  const isIcon = !!iconPaths[src as any];

  return isIcon ? (
    <Box {...props}>
      <MyIcon name={src as any} w={w} borderRadius={props.borderRadius} />
    </Box>
  ) : (
    <Image
      fallbackSrc={LOGO_ICON}
      fallbackStrategy={'onError'}
      objectFit={'contain'}
      alt=""
      w={w}
      h={w}
      src={src || LOGO_ICON}
      {...props}
    />
  );
};

export default Avatar;
