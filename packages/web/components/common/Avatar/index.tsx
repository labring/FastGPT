import React from 'react';
import { Box } from '@chakra-ui/react';
import type { ImageProps } from '@chakra-ui/react';
import { LOGO_ICON } from '@fastgpt/global/common/system/constants';
import MyIcon from '../Icon';
import { iconPaths } from '../Icon/constants';
import MyImage from '../Image/MyImage';

const Avatar = ({
  w = '30px',
  src,
  fill,
  ...props
}: Omit<ImageProps, 'src'> & { src?: string | null }) => {
  // 模板服务可能会为内置图标补充根路径，兼容带前导 `/` 的图标 key。
  const iconName = src?.startsWith('/') ? src.slice(1) : src;
  // @ts-ignore
  const isIcon = !!iconPaths[iconName as any];

  return isIcon ? (
    <Box display={'inline-flex'} {...props}>
      <MyIcon
        name={iconName as any}
        w={w}
        borderRadius={props.borderRadius}
        {...(fill ? { fill } : {})}
      />
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

export default React.memo(Avatar);
