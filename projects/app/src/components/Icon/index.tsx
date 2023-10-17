import React, { useEffect, useState } from 'react';
import type { IconProps } from '@chakra-ui/react';
import { Icon } from '@chakra-ui/react';

const iconPaths = {
  appFill: () => import('./icons/fill/app.svg'),
  appLight: () => import('./icons/light/app.svg'),
  copy: () => import('./icons/copy.svg'),
  chatSend: () => import('./icons/chatSend.svg'),
  delete: () => import('./icons/delete.svg'),
  stop: () => import('./icons/stop.svg'),
  collectionLight: () => import('./icons/collectionLight.svg'),
  collectionSolid: () => import('./icons/collectionSolid.svg'),
  empty: () => import('./icons/empty.svg'),
  back: () => import('./icons/back.svg'),
  backFill: () => import('./icons/fill/back.svg'),
  more: () => import('./icons/more.svg'),
  tabbarChat: () => import('./icons/phoneTabbar/chat.svg'),
  tabbarModel: () => import('./icons/phoneTabbar/app.svg'),
  tabbarMore: () => import('./icons/phoneTabbar/more.svg'),
  tabbarMe: () => import('./icons/phoneTabbar/me.svg'),
  closeSolid: () => import('./icons/closeSolid.svg'),
  wx: () => import('./icons/wx.svg'),
  out: () => import('./icons/out.svg'),
  git: () => import('./icons/git.svg'),
  gitFill: () => import('./icons/fill/git.svg'),
  googleFill: () => import('./icons/fill/google.svg'),
  menu: () => import('./icons/menu.svg'),
  edit: () => import('./icons/edit.svg'),
  inform: () => import('./icons/inform.svg'),
  export: () => import('./icons/export.svg'),
  text: () => import('./icons/text.svg'),
  history: () => import('./icons/history.svg'),
  kbTest: () => import('./icons/kbTest.svg'),
  date: () => import('./icons/date.svg'),
  apikey: () => import('./icons/apikey.svg'),
  apikeyFill: () => import('./icons/fill/apikey.svg'),
  save: () => import('./icons/save.svg'),
  minus: () => import('./icons/minus.svg'),
  chat: () => import('./icons/light/chat.svg'),
  chatFill: () => import('./icons/fill/chat.svg'),
  clear: () => import('./icons/light/clear.svg'),
  apiLight: () => import('./icons/light/appApi.svg'),
  overviewLight: () => import('./icons/light/overview.svg'),
  settingLight: () => import('./icons/light/setting.svg'),
  shareLight: () => import('./icons/light/share.svg'),
  dbLight: () => import('./icons/light/db.svg'),
  dbFill: () => import('./icons/fill/db.svg'),
  appStoreLight: () => import('./icons/light/appStore.svg'),
  appStoreFill: () => import('./icons/fill/appStore.svg'),
  meLight: () => import('./icons/light/me.svg'),
  meFill: () => import('./icons/fill/me.svg'),
  welcomeText: () => import('./icons/modules/welcomeText.svg'),
  variable: () => import('./icons/modules/variable.svg'),
  setTop: () => import('./icons/light/setTop.svg'),
  fullScreenLight: () => import('./icons/light/fullScreen.svg'),
  voice: () => import('./icons/voice.svg'),
  html: () => import('./icons/file/html.svg'),
  pdf: () => import('./icons/file/pdf.svg'),
  markdown: () => import('./icons/file/markdown.svg'),
  importLight: () => import('./icons/light/import.svg'),
  manualImport: () => import('./icons/file/manualImport.svg'),
  indexImport: () => import('./icons/file/indexImport.svg'),
  csvImport: () => import('./icons/file/csv.svg'),
  qaImport: () => import('./icons/file/qaImport.svg'),
  uploadFile: () => import('./icons/file/uploadFile.svg'),
  closeLight: () => import('./icons/light/close.svg'),
  customTitle: () => import('./icons/light/customTitle.svg'),
  billRecordLight: () => import('./icons/light/billRecord.svg'),
  informLight: () => import('./icons/light/inform.svg'),
  payRecordLight: () => import('./icons/light/payRecord.svg'),
  loginoutLight: () => import('./icons/light/loginout.svg'),
  chatModelTag: () => import('./icons/light/chatModelTag.svg'),
  language_en: () => import('./icons/language/en.svg'),
  language_zh: () => import('./icons/language/zh.svg'),
  outlink_share: () => import('./icons/outlink/share.svg'),
  outlink_iframe: () => import('./icons/outlink/iframe.svg'),
  addCircle: () => import('./icons/circle/add.svg'),
  playFill: () => import('./icons/fill/play.svg'),
  courseLight: () => import('./icons/light/course.svg'),
  promotionLight: () => import('./icons/light/promotion.svg'),
  logsLight: () => import('./icons/light/logs.svg'),
  badLight: () => import('./icons/light/bad.svg'),
  markLight: () => import('./icons/light/mark.svg'),
  retryLight: () => import('./icons/light/retry.svg'),
  rightArrowLight: () => import('./icons/light/rightArrow.svg'),
  searchLight: () => import('./icons/light/search.svg'),
  plusFill: () => import('./icons/fill/plus.svg'),
  moveLight: () => import('./icons/light/move.svg'),
  questionGuide: () => import('./icons/app/questionGuide.svg'),
  loading: () => import('./icons/light/loading.svg'),
  pause: () => import('./icons/common/pause.svg')
};

export type IconName = keyof typeof iconPaths;

const MyIcon = ({ name, w = 'auto', h = 'auto', ...props }: { name: IconName } & IconProps) => {
  const [IconComponent, setIconComponent] = useState<any>(null);

  useEffect(() => {
    iconPaths[name]?.()
      .then((icon) => {
        setIconComponent({ as: icon.default });
      })
      .catch((error) => console.log(error));
  }, [name]);

  return !!name && !!iconPaths[name] ? (
    <Icon
      {...IconComponent}
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
