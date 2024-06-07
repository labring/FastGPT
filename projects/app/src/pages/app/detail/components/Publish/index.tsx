import React, { useRef, useState } from 'react';
import { Box, useTheme } from '@chakra-ui/react';

import { PublishChannelEnum } from '@fastgpt/global/support/outLink/constant';
import dynamic from 'next/dynamic';

import MyRadio from '@/components/common/MyRadio';
import { useTranslation } from 'next-i18next';

import Link from './Link';
const API = dynamic(() => import('./API'));
const FeiShu = dynamic(() => import('./FeiShu'));

const OutLink = ({ appId }: { appId: string }) => {
  const { t } = useTranslation();
  const theme = useTheme();
  const publishList = useRef([
    {
      icon: '/imgs/modal/shareFill.svg',
      title: t('core.app.Share link'),
      desc: t('core.app.Share link desc'),
      value: PublishChannelEnum.share
    },
    {
      icon: 'support/outlink/apikeyFill',
      title: t('core.app.Api request'),
      desc: t('core.app.Api request desc'),
      value: PublishChannelEnum.apikey
    }
    // {
    //   icon: 'core/app/publish/lark',
    //   title: t('core.app.publish.Fei shu bot'),
    //   desc: t('core.app.publish.Fei Shu Bot Desc'),
    //   value: PublishChannelEnum.feishu
    // }
  ]);

  const [linkType, setLinkType] = useState<PublishChannelEnum>(PublishChannelEnum.share);

  return (
    <Box pt={[1, 5]}>
      <Box color={'myGray.900'} fontSize={'lg'} mb={2} px={[4, 8]}>
        {t('core.app.navbar.Publish app')}
      </Box>
      <Box pb={[5, 7]} px={[4, 8]} borderBottom={theme.borders.base}>
        <MyRadio
          gridTemplateColumns={['repeat(1,1fr)', 'repeat(auto-fill, minmax(0, 400px))']}
          iconSize={'20px'}
          list={publishList.current}
          value={linkType}
          onChange={(e) => setLinkType(e as PublishChannelEnum)}
        />
      </Box>

      {linkType === PublishChannelEnum.share && (
        <Link appId={appId} type={PublishChannelEnum.share} />
      )}
      {linkType === PublishChannelEnum.apikey && <API appId={appId} />}
      {linkType === PublishChannelEnum.feishu && <FeiShu appId={appId} />}
    </Box>
  );
};

export default OutLink;
