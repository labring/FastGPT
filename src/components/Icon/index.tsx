import React from 'react';
import type { IconProps } from '@chakra-ui/react';
import { Icon } from '@chakra-ui/react';

const map = {
  model: require('./icons/model.svg').default,
  share: require('./icons/share.svg').default,
  home: require('./icons/home.svg').default,
  menu: require('./icons/menu.svg').default,
  pay: require('./icons/pay.svg').default,
  copy: require('./icons/copy.svg').default,
  chatSend: require('./icons/chatSend.svg').default,
  board: require('./icons/board.svg').default,
  develop: require('./icons/develop.svg').default,
  user: require('./icons/user.svg').default,
  promotion: require('./icons/promotion.svg').default,
  delete: require('./icons/delete.svg').default,
  withdraw: require('./icons/withdraw.svg').default,
  dbModel: require('./icons/dbModel.svg').default,
  history: require('./icons/history.svg').default,
  stop: require('./icons/stop.svg').default,
  shareMarket: require('./icons/shareMarket.svg').default,
  collectionLight: require('./icons/collectionLight.svg').default,
  collectionSolid: require('./icons/collectionSolid.svg').default
};

export type IconName = keyof typeof map;

const MyIcon = ({ name, w = 'auto', h = 'auto', ...props }: { name: IconName } & IconProps) => {
  return map[name] ? (
    <Icon
      as={map[name]}
      w={w}
      h={h}
      boxSizing={'content-box'}
      verticalAlign={'top'}
      fill={'currentcolor'}
      {...props}
    />
  ) : null;
};

export default MyIcon;
