import React, { useState } from 'react';
import { Box, useTheme } from '@chakra-ui/react';

import { OutlinkTypeEnum } from '@fastgpt/global/support/outLink/constant';
import dynamic from 'next/dynamic';

import MyRadio from '@/components/common/MyRadio';
import Share from './Share';
import { useTranslation } from 'next-i18next';
import FeiShu from './FeiShu';
const API = dynamic(() => import('./API'));

const OutLink = ({ appId }: { appId: string }) => {
  const { t } = useTranslation();
  const theme = useTheme();

  const [linkType, setLinkType] = useState<OutlinkTypeEnum>(OutlinkTypeEnum.share);

  return (
    <Box pt={[1, 5]}>
      <Box fontWeight={'bold'} fontSize={['md', 'xl']} mb={2} px={[4, 8]}>
        {t('core.app.navbar.Publish app')}
      </Box>
      <Box pb={[5, 7]} px={[4, 8]} borderBottom={theme.borders.base}>
        <MyRadio
          gridTemplateColumns={['repeat(1,1fr)', 'repeat(auto-fill, minmax(0, 400px))']}
          iconSize={'20px'}
          list={[
            {
              icon: '/imgs/modal/shareFill.svg',
              title: t('core.app.Share link'),
              desc: t('core.app.Share link desc'),
              value: OutlinkTypeEnum.share
            },
            {
              icon: 'support/outlink/apikeyFill',
              title: t('core.app.Api request'),
              desc: t('core.app.Api request desc'),
              value: OutlinkTypeEnum.apikey
            },
            // {
            //   icon: 'core/chat/chatFill',
            //   title: t('core.app.Wecom Kf'),
            //   desc: t('core.app.Wecom Kf Desc'),
            //   value: OutLinkTypeEnum.wecom
            // },
            {
              icon: 'feishu',
              title: t('core.app.FeiShu Bot'),
              desc: t('core.app.FeiShu Bot Desc'),
              value: OutlinkTypeEnum.feishu
            }
            // {
            //   icon: 'support/outlink/iframeLight',
            //   title: '网页嵌入',
            //   desc: '嵌入到已有网页中，右下角会生成对话按键',
            //   value: OutLinkTypeEnum.iframe
            // }
          ]}
          value={linkType}
          onChange={(e) => setLinkType(e as OutlinkTypeEnum)}
        />
      </Box>

      {linkType === OutlinkTypeEnum.share && <Share appId={appId} type={OutlinkTypeEnum.share} />}
      {linkType === OutlinkTypeEnum.apikey && <API appId={appId} />}
      {/* {linkType === OutLinkTypeEnum.wecom && <Share appId={appId} type="wecom" />} // TODO: Not impelement */}
      {linkType === OutlinkTypeEnum.feishu && <FeiShu appId={appId} />}
    </Box>
  );
};

export default OutLink;
