import React from 'react';
import { Box } from '@chakra-ui/react';
import type { ImageProps } from '@chakra-ui/react';
import { LOGO_ICON } from '@fastgpt/global/common/system/constants';
import MyIcon from '../Icon';
import { iconPaths } from '../Icon/constants';
import MyImage from '../Image/MyImage';

const Avatar = ({ w = '30px', src, ...props }: ImageProps) => {
  // @ts-ignore
  const isIcon = !!iconPaths[src as any];

  return isIcon ? (
    <Box display={'inline-flex'} {...props}>
      <MyIcon name={src as any} w={w} borderRadius={props.borderRadius} />
    </Box>
  ) : (
    <MyImage
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
