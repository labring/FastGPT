import React from 'react';
import type { IconProps } from '@chakra-ui/react';
import { Icon } from '@chakra-ui/react';
import dynamic from 'next/dynamic';

const map = {
  model: require('./icons/model.svg').default,
  share: require('./icons/share.svg').default,
  home: require('./icons/home.svg').default,
  menu: require('./icons/menu.svg').default,
  pay: require('./icons/pay.svg').default
};

export type IconName = keyof typeof map;

const MyIcon = ({ name, w = 'auto', h = 'auto', ...props }: { name: IconName } & IconProps) => {
  return map[name] ? (
    <Icon as={map[name]} w={w} h={h} boxSizing={'content-box'} verticalAlign={'top'} {...props} />
  ) : null;
};

export default MyIcon;
