import React, { useRef, useState } from 'react';
import { Box, Flex } from '@chakra-ui/react';

import { PublishChannelEnum } from '@fastgpt/global/support/outLink/constant';
import dynamic from 'next/dynamic';

import MyRadio from '@/components/common/MyRadio';
import { useTranslation } from 'next-i18next';

import { useContextSelector } from 'use-context-selector';
import { AppContext } from '../context';
import { cardStyles } from '../constants';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useToast } from '@fastgpt/web/hooks/useToast';

const Link = dynamic(() => import('./Link'));
const API = dynamic(() => import('./API'));
const FeiShu = dynamic(() => import('./FeiShu'));

const OutLink = () => {
  const { t } = useTranslation();
  const { feConfigs } = useSystemStore();
  const { toast } = useToast();

  const appId = useContextSelector(AppContext, (v) => v.appId);

  const publishList = useRef([
    {
      icon: '/imgs/modal/shareFill.svg',
      title: t('common:core.app.Share link'),
      desc: t('common:core.app.Share link desc'),
      value: PublishChannelEnum.share,
      isProFn: false
    },
    {
      icon: 'support/outlink/apikeyFill',
      title: t('common:core.app.Api request'),
      desc: t('common:core.app.Api request desc'),
      value: PublishChannelEnum.apikey,
      isProFn: false
    },
    {
      icon: 'core/app/publish/lark',
      title: t('publish:feishu_bot'),
      desc: t('publish:feishu_bot_desc'),
      value: PublishChannelEnum.feishu,
      isProFn: true
    }
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
          onChange={(e) => {
            const config = publishList.current.find((v) => v.value === e)!;
            if (!feConfigs.isPlus && config.isProFn) {
              toast({
                status: 'warning',
                title: t('common:common.system.Commercial version function')
              });
            } else {
              setLinkType(e as PublishChannelEnum);
            }
          }}
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
