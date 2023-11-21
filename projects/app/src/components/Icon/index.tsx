import React, { useEffect, useState } from 'react';
import type { IconProps } from '@chakra-ui/react';
import { Icon } from '@chakra-ui/react';

const iconPaths = {
  copy: () => import('./icons/copy.svg'),
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
  'support/pay/payRecordLight': () => import('./icons/support/pay/payRecordLight.svg'),
  'support/account/loginoutLight': () => import('./icons/support/account/loginoutLight.svg'),
  'core/chat/chatModelTag': () => import('./icons/core/chat/chatModelTag.svg'),
  'common/language/en': () => import('./icons/common/language/en.svg'),
  'common/language/zh': () => import('./icons/common/language/zh.svg'),
  'support/outlink/shareLight': () => import('./icons/support/outlink/shareLight.svg'),
  'support/outlink/iframeLight': () => import('./icons/support/outlink/iframeLight.svg'),
  'common/addCircleLight': () => import('./icons/common/addCircleLight.svg'),
  'common/playFill': () => import('./icons/common/playFill.svg'),
  'common/courseLight': () => import('./icons/common/courseLight.svg'),
  'support/account/promotionLight': () => import('./icons/support/account/promotionLight.svg'),
  'core/app/logsLight': () => import('./icons/core/app/logsLight.svg'),
  'core/chat/feedback/badLight': () => import('./icons/core/chat/feedback/badLight.svg'),
  'core/app/markLight': () => import('./icons/core/app/markLight.svg'),
  'common/retryLight': () => import('./icons/common/retryLight.svg'),
  'common/rightArrowLight': () => import('./icons/common/rightArrowLight.svg'),
  'common/searchLight': () => import('./icons/common/searchLight.svg'),
  'common/file/move': () => import('./icons/common/file/move.svg'),
  'core/app/questionGuide': () => import('./icons/core/app/questionGuide.svg'),
  'common/loading': () => import('./icons/common/loading.svg'),
  'core/app/aiLight': () => import('./icons/core/app/aiLight.svg'),
  'core/app/aiFill': () => import('./icons/core/app/aiFill.svg'),
  'common/text/t': () => import('./icons/common/text/t.svg'),
  'common/navbar/pluginLight': () => import('./icons/common/navbar/pluginLight.svg'),
  'common/navbar/pluginFill': () => import('./icons/common/navbar/pluginFill.svg'),
  'common/refreshLight': () => import('./icons/common/refreshLight.svg'),
  'core/module/previewLight': () => import('./icons/core/module/previewLight.svg'),
  'core/chat/quoteFill': () => import('./icons/core/chat/quoteFill.svg'),
  'core/chat/QGFill': () => import('./icons/core/chat/QGFill.svg'),
  'common/tickFill': () => import('./icons/common/tickFill.svg'),
  'common/inviteLight': () => import('./icons/common/inviteLight.svg'),
  'support/team/memberLight': () => import('./icons/support/team/memberLight.svg'),
  'support/permission/privateLight': () => import('./icons/support/permission/privateLight.svg'),
  'support/permission/publicLight': () => import('./icons/support/permission/publicLight.svg'),
  'core/app/ttsFill': () => import('./icons/core/app/ttsFill.svg'),
  'core/app/tts': () => import('./icons/core/app/tts.svg'),
  'core/app/headphones': () => import('./icons/core/app/headphones.svg'),
  'common/playLight': () => import('./icons/common/playLight.svg'),
  'core/chat/sendFill': () => import('./icons/core/chat/sendFill.svg'),
  'core/chat/recordFill': () => import('./icons/core/chat/recordFill.svg'),
  'core/chat/stopSpeechFill': () => import('./icons/core/chat/stopSpeechFill.svg'),
  'core/chat/stopSpeech': () => import('./icons/core/chat/stopSpeech.svg'),
  'core/chat/speaking': () => import('./icons/core/chat/speaking.svg'),
  'core/chat/fileSelect': () => import('./icons/core/chat/fileSelect.svg')
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
