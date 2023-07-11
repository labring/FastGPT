import React from 'react';
import type { IconProps } from '@chakra-ui/react';
import { Icon } from '@chakra-ui/react';

const map = {
  model: require('./icons/model.svg').default,
  copy: require('./icons/copy.svg').default,
  chatSend: require('./icons/chatSend.svg').default,
  delete: require('./icons/delete.svg').default,
  withdraw: require('./icons/withdraw.svg').default,
  stop: require('./icons/stop.svg').default,
  collectionLight: require('./icons/collectionLight.svg').default,
  collectionSolid: require('./icons/collectionSolid.svg').default,
  empty: require('./icons/empty.svg').default,
  back: require('./icons/back.svg').default,
  backFill: require('./icons/fill/back.svg').default,
  more: require('./icons/more.svg').default,
  tabbarChat: require('./icons/phoneTabbar/chat.svg').default,
  tabbarModel: require('./icons/phoneTabbar/model.svg').default,
  tabbarMore: require('./icons/phoneTabbar/more.svg').default,
  tabbarMe: require('./icons/phoneTabbar/me.svg').default,
  closeSolid: require('./icons/closeSolid.svg').default,
  wx: require('./icons/wx.svg').default,
  out: require('./icons/out.svg').default,
  git: require('./icons/git.svg').default,
  menu: require('./icons/menu.svg').default,
  edit: require('./icons/edit.svg').default,
  inform: require('./icons/inform.svg').default,
  export: require('./icons/export.svg').default,
  text: require('./icons/text.svg').default,
  history: require('./icons/history.svg').default,
  kbTest: require('./icons/kbTest.svg').default,
  date: require('./icons/date.svg').default,
  apikey: require('./icons/apikey.svg').default,
  save: require('./icons/save.svg').default,
  minus: require('./icons/minus.svg').default,
  chatLight: require('./icons/light/chat.svg').default,
  chatFill: require('./icons/fill/chat.svg').default,
  clearLight: require('./icons/light/clear.svg').default,
  apiLight: require('./icons/light/appApi.svg').default,
  overviewLight: require('./icons/light/overview.svg').default,
  settingLight: require('./icons/light/setting.svg').default,
  shareLight: require('./icons/light/share.svg').default,
  dbLight: require('./icons/light/db.svg').default,
  dbFill: require('./icons/fill/db.svg').default,
  appLight: require('./icons/light/app.svg').default,
  appFill: require('./icons/fill/app.svg').default,
  meLight: require('./icons/light/me.svg').default,
  meFill: require('./icons/fill/me.svg').default,
  welcomeText: require('./icons/modules/welcomeText.svg').default,
  variable: require('./icons/modules/variable.svg').default,
  setTop: require('./icons/light/setTop.svg').default,
  voice: require('./icons/voice.svg').default
};

export type IconName = keyof typeof map;

const MyIcon = (
  { name, w = 'auto', h = 'auto', ...props }: { name: IconName } & IconProps,
  ref: any
) => {
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

export default React.forwardRef(MyIcon);
