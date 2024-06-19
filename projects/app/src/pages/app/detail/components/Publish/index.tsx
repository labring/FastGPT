import React, { useRef, useState } from 'react';
import { Box, Flex, useTheme } from '@chakra-ui/react';

import { PublishChannelEnum } from '@fastgpt/global/support/outLink/constant';
import dynamic from 'next/dynamic';

import MyRadio from '@/components/common/MyRadio';
import { useTranslation } from 'next-i18next';

import { useContextSelector } from 'use-context-selector';
import { AppContext } from '../context';
import { cardStyles } from '../constants';

import Link from './Link';
const API = dynamic(() => import('./API'));
const FeiShu = dynamic(() => import('./FeiShu'));

const OutLink = () => {
  const { t } = useTranslation();
  const theme = useTheme();

  const appId = useContextSelector(AppContext, (v) => v.appId);

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
    <>
      <Box {...cardStyles} boxShadow={2} px={[4, 8]} py={[4, 6]}>
        <MyRadio
          gridTemplateColumns={['repeat(1,1fr)', 'repeat(auto-fill, minmax(0, 400px))']}
          iconSize={'20px'}
          list={publishList.current}
          value={linkType}
          onChange={(e) => setLinkType(e as PublishChannelEnum)}
        />
      </Box>

      <Flex
        flexDirection={'column'}
        {...cardStyles}
        boxShadow={3.5}
        mt={4}
        px={[4, 8]}
        py={[4, 6]}
        flex={'1 0 0'}
      >
        {linkType === PublishChannelEnum.share && (
          <Link appId={appId} type={PublishChannelEnum.share} />
        )}
        {linkType === PublishChannelEnum.apikey && <API appId={appId} />}
        {linkType === PublishChannelEnum.feishu && <FeiShu appId={appId} />}
      </Flex>
    </>
  );
};

export default OutLink;
