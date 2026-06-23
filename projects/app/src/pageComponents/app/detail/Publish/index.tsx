import React, { useMemo, useState } from 'react';
import { Box, HStack } from '@chakra-ui/react';

import { PublishChannelEnum } from '@fastgpt/global/support/outLink/constant';
import dynamic from 'next/dynamic';

import MyRadio from '@/components/common/MyRadio';
import { useTranslation } from 'next-i18next';

import { useContextSelector } from 'use-context-selector';
import { AppContext } from '../context';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useUserStore } from '@/web/support/user/useUserStore';
import { UserTagsSchema } from '@fastgpt/global/support/user/type';
import ProTag from '@/components/ProTip/Tag';

const Link = dynamic(() => import('./Link'));
const API = dynamic(() => import('./API'));
const FeiShu = dynamic(() => import('./FeiShu'));
const DingTalk = dynamic(() => import('./DingTalk'));
const Wecom = dynamic(() => import('./Wecom'));
const OffiAccount = dynamic(() => import('./OffiAccount'));
const Wechat = dynamic(() => import('./Wechat'));
const Playground = dynamic(() => import('./Playground'));

const OutLink = () => {
  const { t } = useTranslation();
  const { feConfigs, setShowProModal } = useSystemStore();
  const { userInfo } = useUserStore();

  const appId = useContextSelector(AppContext, (v) => v.appId);
  const isPro = !!feConfigs.isPlus;

  const publishList = useMemo(
    () => [
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
      ...(feConfigs?.show_publish_wechat !== false
        ? [
            {
              icon: 'core/app/publish/wechat',
              title: t('publish:wechat.bot'),
              desc: t('publish:wechat.bot_desc'),
              value: PublishChannelEnum.wechat,
              isProFn: false
            }
          ]
        : []),
      ...(feConfigs?.show_publish_feishu !== false &&
      !userInfo?.tags?.includes(UserTagsSchema.enum.wecom)
        ? [
            {
              icon: 'core/app/publish/lark',
              title: (
                <HStack gap={1}>
                  <Box>{t('publish:feishu_bot')}</Box>
                  {!isPro && <ProTag />}
                </HStack>
              ),
              desc: t('publish:feishu_bot_desc'),
              value: PublishChannelEnum.feishu,
              isProFn: true
            }
          ]
        : []),
      ...(feConfigs?.show_publish_dingtalk !== false &&
      !userInfo?.tags?.includes(UserTagsSchema.enum.wecom)
        ? [
            {
              icon: 'common/dingtalkFill',
              title: (
                <HStack gap={1}>
                  <Box>{t('publish:dingtalk.bot')}</Box>
                  {!isPro && <ProTag />}
                </HStack>
              ),
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
              title: (
                <HStack gap={1}>
                  <Box>{t('publish:wecom.bot')}</Box>
                  {!isPro && <ProTag />}
                </HStack>
              ),
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
              title: (
                <HStack gap={1}>
                  <Box>{t('publish:official_account.name')}</Box>
                  {!isPro && <ProTag />}
                </HStack>
              ),
              desc: t('publish:official_account.desc'),
              value: PublishChannelEnum.officialAccount,
              isProFn: true
            }
          ]
        : []),

      {
        icon: 'core/chat/sidebar/home',
        title: (
          <HStack gap={1}>
            <Box>{t('common:navbar.Chat')}</Box>
            {!isPro && <ProTag />}
          </HStack>
        ),
        desc: t('app:publish.chat_desc'),
        value: PublishChannelEnum.playground,
        isProFn: true
      }
    ],
    [t, feConfigs, isPro, userInfo?.tags]
  );

  const [linkType, setLinkType] = useState<PublishChannelEnum>(PublishChannelEnum.share);

  return (
    <Box>
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
          gridGap={[2, 3]}
          list={publishList}
          value={linkType}
          onChange={(e) => {
            const config = publishList.find((v) => v.value === e)!;
            if (!feConfigs.isPlus && config.isProFn) {
              setShowProModal(true);
            } else {
              setLinkType(e as PublishChannelEnum);
            }
          }}
        />
      </Box>

      <Box mt={2} px={[4, 8]} py={[4, 6]}>
        {linkType === PublishChannelEnum.share && (
          <Link appId={appId} type={PublishChannelEnum.share} />
        )}
        {linkType === PublishChannelEnum.apikey && <API />}
        {linkType === PublishChannelEnum.feishu && <FeiShu appId={appId} />}
        {linkType === PublishChannelEnum.dingtalk && <DingTalk appId={appId} />}
        {linkType === PublishChannelEnum.wecom && <Wecom appId={appId} />}
        {linkType === PublishChannelEnum.officialAccount && <OffiAccount appId={appId} />}
        {linkType === PublishChannelEnum.wechat && <Wechat appId={appId} />}
        {linkType === PublishChannelEnum.playground && <Playground appId={appId} />}
      </Box>
    </Box>
  );
};

export default OutLink;
