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
const DingTalk = dynamic(() => import('./DingTalk'));
const Wecom = dynamic(() => import('./Wecom'));
const OffiAccount = dynamic(() => import('./OffiAccount'));
const Playground = dynamic(() => import('./Playground'));

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
    ...(feConfigs?.show_publish_feishu !== false
      ? [
          {
            icon: 'core/app/publish/lark',
            title: t('publish:feishu_bot'),
            desc: t('publish:feishu_bot_desc'),
            value: PublishChannelEnum.feishu,
            isProFn: true
          }
        ]
      : []),
    ...(feConfigs?.show_publish_dingtalk !== false
      ? [
          {
            icon: 'common/dingtalkFill',
            title: t('publish:dingtalk.bot'),
            desc: t('publish:dingtalk.bot_desc'),
            value: PublishChannelEnum.dingtalk,
            isProFn: true
          }
        ]
      : []),
    ...(feConfigs?.show_publish_wecom === true
      ? [
          {
            icon: 'core/app/publish/wecom',
            title: t('publish:wecom.bot'),
            desc: t('publish:wecom.bot_desc'),
            value: PublishChannelEnum.wecom,
            isProFn: true
          }
        ]
      : []),
    ...(feConfigs?.show_publish_offiaccount !== false
      ? [
          {
            icon: 'core/app/publish/offiaccount',
            title: t('publish:official_account.name'),
            desc: t('publish:official_account.desc'),
            value: PublishChannelEnum.officialAccount,
            isProFn: true
          }
        ]
      : []),
    {
      icon: 'core/chat/sidebar/home',
      title: t('common:navbar.Chat'),
      desc: t('app:publish.chat_desc'),
      value: PublishChannelEnum.playground,
      isProFn: false
    }
  ]);

  const [linkType, setLinkType] = useState<PublishChannelEnum>(PublishChannelEnum.share);

  return (
    <Box
      display={['block', 'flex']}
      overflowY={'auto'}
      overflowX={'hidden'}
      h={'100%'}
      flexDirection={'column'}
    >
      <Box mx={[4, 8]} py={[4, 6]} borderBottom={'1px solid'} borderColor={'myGray.150'}>
        <MyRadio
          gridTemplateColumns={[
            'repeat(1,1fr)',
            'repeat(2, 1fr)',
            'repeat(3, 1fr)',
            'repeat(3, 1fr)',
            'repeat(4, 1fr)'
          ]}
          iconSize={'20px'}
          list={publishList.current}
          value={linkType}
          onChange={(e) => {
            const config = publishList.current.find((v) => v.value === e)!;
            if (!feConfigs.isPlus && config.isProFn) {
              toast({
                status: 'warning',
                title: t('common:commercial_function_tip')
              });
            } else {
              setLinkType(e as PublishChannelEnum);
            }
          }}
        />
      </Box>

      <Flex flexDirection={'column'} mt={2} px={[4, 8]} py={[4, 6]} flex={1}>
        {linkType === PublishChannelEnum.share && (
          <Link appId={appId} type={PublishChannelEnum.share} />
        )}
        {linkType === PublishChannelEnum.apikey && <API appId={appId} />}
        {linkType === PublishChannelEnum.feishu && <FeiShu appId={appId} />}
        {linkType === PublishChannelEnum.dingtalk && <DingTalk appId={appId} />}
        {linkType === PublishChannelEnum.wecom && <Wecom appId={appId} />}
        {linkType === PublishChannelEnum.officialAccount && <OffiAccount appId={appId} />}
        {linkType === PublishChannelEnum.playground && <Playground appId={appId} />}
      </Flex>
    </Box>
  );
};

export default OutLink;
