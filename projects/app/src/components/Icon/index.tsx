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
  'common/backLight': () => import('./icons/common/backLight.svg'),
  'common/backFill': () => import('./icons/common/backFill.svg'),
  more: () => import('./icons/more.svg'),
  'phoneTabbar/tabbarMore': () => import('./icons/phoneTabbar/more.svg'),
  'phoneTabbar/tabbarMe': () => import('./icons/phoneTabbar/me.svg'),
  closeSolid: () => import('./icons/closeSolid.svg'),
  wx: () => import('./icons/wx.svg'),
  out: () => import('./icons/out.svg'),
  'common/gitLight': () => import('./icons/common/gitLight.svg'),
  'common/gitFill': () => import('./icons/common/gitFill.svg'),
  'common/googleFill': () => import('./icons/common/googleFill.svg'),
  menu: () => import('./icons/menu.svg'),
  edit: () => import('./icons/edit.svg'),
  inform: () => import('./icons/inform.svg'),
  export: () => import('./icons/export.svg'),
  text: () => import('./icons/text.svg'),
  history: () => import('./icons/history.svg'),
  kbTest: () => import('./icons/kbTest.svg'),
  date: () => import('./icons/date.svg'),
  'support/outlink/apikeyLight': () => import('./icons/support/outlink/apikeyLight.svg'),
  'support/outlink/apikeyFill': () => import('./icons/support/outlink/apikeyFill.svg'),
  save: () => import('./icons/save.svg'),
  minus: () => import('./icons/minus.svg'),
  'core/chat/chatLight': () => import('./icons/core/chat/chatLight.svg'),
  'core/dataset/chatFill': () => import('./icons/core/chat/chatFill.svg'),
  'common/clearLight': () => import('./icons/common/clearLight.svg'),
  'core/app/appApiLight': () => import('./icons/core/app/appApiLight.svg'),
  'common/overviewLight': () => import('./icons/common/overviewLight.svg'),
  'common/settingLight': () => import('./icons/common/settingLight.svg'),
  'core/dataset/datasetLight': () => import('./icons/core/dataset/datasetLight.svg'),
  'core/dataset/datasetFill': () => import('./icons/core/dataset/datasetFill.svg'),
  'support/user/userLight': () => import('./icons/support/user/userLight.svg'),
  'support/user/userFill': () => import('./icons/support/user/userFill.svg'),
  'core/modules/welcomeText': () => import('./icons/core/modules/welcomeText.svg'),
  'core/chat/setTopLight': () => import('./icons/core/chat/setTopLight.svg'),
  'common/fullScreenLight': () => import('./icons/common/fullScreenLight.svg'),
  'common/voiceLight': () => import('./icons/common/voiceLight.svg'),
  'common/importLight': () => import('./icons/common/importLight.svg'),
  'file/html': () => import('./icons/file/html.svg'),
  'file/pdf': () => import('./icons/file/pdf.svg'),
  'file/markdown': () => import('./icons/file/markdown.svg'),
  'file/indexImport': () => import('./icons/file/indexImport.svg'),
  'file/csvImport': () => import('./icons/file/csv.svg'),
  'file/qaImport': () => import('./icons/file/qaImport.svg'),
  'file/uploadFile': () => import('./icons/file/uploadFile.svg'),
  'common/closeLight': () => import('./icons/common/closeLight.svg'),
  'common/customTitleLight': () => import('./icons/common/customTitleLight.svg'),
  'support/bill/billRecordLight': () => import('./icons/support/bill/billRecordLight.svg'),
  'support/user/informLight': () => import('./icons/support/user/informLight.svg'),
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
  'core/chat/feedback/goodLight': () => import('./icons/core/chat/feedback/goodLight.svg'),
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
  'core/modules/previewLight': () => import('./icons/core/modules/previewLight.svg'),
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
  'core/chat/quoteSign': () => import('./icons/core/chat/quoteSign.svg'),
  'core/chat/sendLight': () => import('./icons/core/chat/sendLight.svg'),
  'core/chat/sendFill': () => import('./icons/core/chat/sendFill.svg'),
  'core/chat/recordFill': () => import('./icons/core/chat/recordFill.svg'),
  'core/chat/stopSpeechFill': () => import('./icons/core/chat/stopSpeechFill.svg'),
  'core/chat/stopSpeech': () => import('./icons/core/chat/stopSpeech.svg'),
  'core/chat/speaking': () => import('./icons/core/chat/speaking.svg'),
  'core/chat/fileSelect': () => import('./icons/core/chat/fileSelect.svg'),
  'core/dataset/modeEmbedding': () => import('./icons/core/dataset/modeEmbedding.svg'),
  'core/dataset/fullTextRecall': () => import('./icons/core/dataset/fullTextRecall.svg'),
  'core/dataset/mixedRecall': () => import('./icons/core/dataset/mixedRecall.svg'),
  'core/app/variable/input': () => import('./icons/core/app/variable/input.svg'),
  'core/app/variable/textarea': () => import('./icons/core/app/variable/textarea.svg'),
  'core/app/variable/select': () => import('./icons/core/app/variable/select.svg'),
  'core/dataset/websiteDataset': () => import('./icons/core/dataset/websiteDataset.svg'),
  'core/dataset/commonDataset': () => import('./icons/core/dataset/commonDataset.svg'),
  'core/dataset/folderDataset': () => import('./icons/core/dataset/folderDataset.svg'),
  'common/confirm/deleteTip': () => import('./icons/common/confirm/deleteTip.svg'),
  'common/confirm/commonTip': () => import('./icons/common/confirm/commonTip.svg'),
  'common/routePushLight': () => import('./icons/common/routePushLight.svg'),
  'common/viewLight': () => import('./icons/common/viewLight.svg'),
  'core/app/customFeedback': () => import('./icons/core/app/customFeedback.svg'),
  'support/pay/priceLight': () => import('./icons/support/pay/priceLight.svg'),
  'core/dataset/rerank': () => import('./icons/core/dataset/rerank.svg')
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
