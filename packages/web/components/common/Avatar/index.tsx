import React from 'react';
import { Box } from '@chakra-ui/react';
import type { ImageProps } from '@chakra-ui/react';
import { LOGO_ICON, SANGFOR_LOGO_ICON } from '@fastgpt/global/common/system/constants';
import MyIcon from '../Icon';
import { iconPaths } from '../Icon/constants';
import MyImage from '../Image/MyImage';
import { useSystem } from '../../../hooks/useSystem';
import { getWebReqUrl } from '../../../common/system/utils';

const Avatar = ({ w = '30px', src, ...props }: ImageProps) => {
  // @ts-ignore
  const isIcon = !!iconPaths[src as any];
  const isAicp = src?.toLowerCase()?.includes('aicp');
  const { systemLogo } = useSystem();
  const defaultIcon = getWebReqUrl(systemLogo || LOGO_ICON);

  return isIcon ? (
    <Box display={'inline-flex'} {...props}>
      <MyIcon name={src as any} w={w} borderRadius={props.borderRadius} />
    </Box>
  ) : (
    <MyImage
      fallbackSrc={defaultIcon}
      fallbackStrategy={'onError'}
      objectFit={'contain'}
      alt=""
      w={w}
      h={w}
      src={isAicp ? SANGFOR_LOGO_ICON : src || defaultIcon}
      {...props}
    />
  );
};

export default React.memo(Avatar);
