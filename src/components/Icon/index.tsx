import React from 'react';
import type { IconProps } from '@chakra-ui/react';
import { Icon } from '@chakra-ui/react';
import dynamic from 'next/dynamic';

const map = {
  model: dynamic(() => import('./icons/model.svg')),
  share: dynamic(() => import('./icons/share.svg')),
  home: dynamic(() => import('./icons/home.svg'))
};

const MyIcon = ({
  name,
  w = 'auto',
  h = 'auto',
  ...props
}: { name: keyof typeof map } & IconProps) => {
  return map[name] ? <Icon as={map[name]} w={w} h={h} {...props} /> : null;
};

export default MyIcon;
