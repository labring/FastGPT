import React from 'react';
import type { IconProps } from '@chakra-ui/react';
import { Icon } from '@chakra-ui/react';

const map = {
  appFill: require('./icons/fill/app.svg').default,
  appLight: require('./icons/light/app.svg').default,
  copy: require('./icons/copy.svg').default,
  chatSend: require('./icons/chatSend.svg').default,
  delete: require('./icons/delete.svg').default,
  stop: require('./icons/stop.svg').default,
  collectionLight: require('./icons/collectionLight.svg').default,
  collectionSolid: require('./icons/collectionSolid.svg').default,
  empty: require('./icons/empty.svg').default,
  back: require('./icons/back.svg').default,
  backFill: require('./icons/fill/back.svg').default,
  more: require('./icons/more.svg').default,
  tabbarChat: require('./icons/phoneTabbar/chat.svg').default,
  tabbarModel: require('./icons/phoneTabbar/app.svg').default,
  tabbarMore: require('./icons/phoneTabbar/more.svg').default,
  tabbarMe: require('./icons/phoneTabbar/me.svg').default,
  closeSolid: require('./icons/closeSolid.svg').default,
  wx: require('./icons/wx.svg').default,
  out: require('./icons/out.svg').default,
  git: require('./icons/git.svg').default,
  gitFill: require('./icons/fill/git.svg').default,
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
  chat: require('./icons/light/chat.svg').default,
  chatFill: require('./icons/fill/chat.svg').default,
  clear: require('./icons/light/clear.svg').default,
  apiLight: require('./icons/light/appApi.svg').default,
  overviewLight: require('./icons/light/overview.svg').default,
  settingLight: require('./icons/light/setting.svg').default,
  shareLight: require('./icons/light/share.svg').default,
  dbLight: require('./icons/light/db.svg').default,
  dbFill: require('./icons/fill/db.svg').default,
  appStoreLight: require('./icons/light/appStore.svg').default,
  appStoreFill: require('./icons/fill/appStore.svg').default,
  meLight: require('./icons/light/me.svg').default,
  meFill: require('./icons/fill/me.svg').default,
  welcomeText: require('./icons/modules/welcomeText.svg').default,
  variable: require('./icons/modules/variable.svg').default,
  setTop: require('./icons/light/setTop.svg').default,
  fullScreenLight: require('./icons/light/fullScreen.svg').default,
  voice: require('./icons/voice.svg').default,
  html: require('./icons/file/html.svg').default,
  pdf: require('./icons/file/pdf.svg').default,
  markdown: require('./icons/file/markdown.svg').default,
  importLight: require('./icons/light/import.svg').default,
  manualImport: require('./icons/file/manualImport.svg').default,
  indexImport: require('./icons/file/indexImport.svg').default,
  csvImport: require('./icons/file/csv.svg').default,
  qaImport: require('./icons/file/qaImport.svg').default,
  uploadFile: require('./icons/file/uploadFile.svg').default,
  closeLight: require('./icons/light/close.svg').default,
  customTitle: require('./icons/light/customTitle.svg').default,
  billRecordLight: require('./icons/light/billRecord.svg').default,
  informLight: require('./icons/light/inform.svg').default,
  payRecordLight: require('./icons/light/payRecord.svg').default,
  loginoutLight: require('./icons/light/loginout.svg').default,
  chatModelTag: require('./icons/light/chatModelTag.svg').default,
  language_en: require('./icons/language/en.svg').default,
  language_zh: require('./icons/language/zh.svg').default,
  outlink_share: require('./icons/outlink/share.svg').default,
  outlink_iframe: require('./icons/outlink/iframe.svg').default,
  addCircle: require('./icons/circle/add.svg').default,
  playFill: require('./icons/fill/play.svg').default,
  courseLight: require('./icons/light/course.svg').default,
  promotionLight: require('./icons/light/promotion.svg').default,
  logsLight: require('./icons/light/logs.svg').default,
  badLight: require('./icons/light/bad.svg').default,
  markLight: require('./icons/light/mark.svg').default
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
