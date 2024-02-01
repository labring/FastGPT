import React, { useState } from 'react';
import { Box, useTheme } from '@chakra-ui/react';

import { OutLinkTypeEnum } from '@fastgpt/global/support/outLink/constant';
import dynamic from 'next/dynamic';

import MyRadio from '@/components/common/MyRadio';
import Share from './Share';
import { useTranslation } from 'next-i18next';
const API = dynamic(() => import('./API'));

const OutLink = ({ appId }: { appId: string }) => {
  const { t } = useTranslation();
  const theme = useTheme();

  const [linkType, setLinkType] = useState<`${OutLinkTypeEnum}`>(OutLinkTypeEnum.share);

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
              value: OutLinkTypeEnum.share
            },
            {
              icon: 'support/outlink/apikeyFill',
              title: t('core.app.Api request'),
              desc: t('core.app.Api request desc'),
              value: OutLinkTypeEnum.apikey
            }
            // {
            //   icon: 'support/outlink/iframeLight',
            //   title: '网页嵌入',
            //   desc: '嵌入到已有网页中，右下角会生成对话按键',
            //   value: OutLinkTypeEnum.iframe
            // }
          ]}
          value={linkType}
          onChange={(e) => setLinkType(e as `${OutLinkTypeEnum}`)}
        />
      </Box>

      {linkType === OutLinkTypeEnum.share && <Share appId={appId} />}
      {linkType === OutLinkTypeEnum.apikey && <API appId={appId} />}
    </Box>
  );
};

export default OutLink;
