import React, { useMemo, useState } from 'react';
import { Box, Button, Flex, HStack } from '@chakra-ui/react';
import { useQuery } from '@tanstack/react-query';

import { PublishChannelEnum } from '@fastgpt/global/support/outLink/constant';
import type { OutLinkCountResponseType } from '@fastgpt/global/openapi/support/outLink/api';
import dynamic from 'next/dynamic';

import { useTranslation } from 'next-i18next';

import { useContextSelector } from 'use-context-selector';
import { AppContext } from '../context';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useUserStore } from '@/web/support/user/useUserStore';
import { UserTagsSchema } from '@fastgpt/global/support/user/type';
import ProTag from '@/components/ProTip/Tag';
import Avatar from '@fastgpt/web/components/common/Avatar';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { getOutLinkCounts } from '@/web/support/outLink/api';

const Link = dynamic(() => import('./Link'));
const API = dynamic(() => import('./API'));
const FeiShu = dynamic(() => import('./FeiShu'));
const DingTalk = dynamic(() => import('./DingTalk'));
const Wecom = dynamic(() => import('./Wecom'));
const OffiAccount = dynamic(() => import('./OffiAccount'));
const Wechat = dynamic(() => import('./Wechat'));
const Playground = dynamic(() => import('./Playground'));

type PublishListItem = {
  icon: string;
  title: React.ReactNode;
  value: PublishChannelEnum;
  isProFn: boolean;
  group: 'native' | 'thirdParty';
  countKey?: keyof OutLinkCountResponseType;
};

const OutLink = () => {
  const { t } = useTranslation();
  const { feConfigs, setShowProModal } = useSystemStore();
  const { userInfo } = useUserStore();

  const appId = useContextSelector(AppContext, (v) => v.appId);
  const isPro = !!feConfigs.isPlus;
  const { data: outLinkCounts, refetch: refetchOutLinkCounts } = useQuery(
    ['outLinkCounts', appId],
    () => getOutLinkCounts({ appId }),
    { enabled: !!appId }
  );

  const publishList = useMemo<PublishListItem[]>(
    () => [
      {
        icon: 'support/outlink/share',
        title: t('common:core.app.Share link'),
        value: PublishChannelEnum.share,
        isProFn: false,
        group: 'native',
        countKey: PublishChannelEnum.share
      },
      {
        icon: 'support/outlink/apikeyFill',
        title: t('common:core.app.Api request'),
        value: PublishChannelEnum.apikey,
        isProFn: false,
        group: 'native'
      },
      {
        icon: 'core/chat/sidebar/home',
        title: (
          <HStack gap={1}>
            <Box>{t('common:navbar.Chat')}</Box>
            {!isPro && <ProTag />}
          </HStack>
        ),
        value: PublishChannelEnum.playground,
        isProFn: true,
        group: 'native'
      },
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
              value: PublishChannelEnum.feishu,
              isProFn: true,
              group: 'thirdParty' as const,
              countKey: PublishChannelEnum.feishu as PublishChannelEnum.feishu
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
              value: PublishChannelEnum.dingtalk,
              isProFn: true,
              group: 'thirdParty' as const,
              countKey: PublishChannelEnum.dingtalk as PublishChannelEnum.dingtalk
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
              value: PublishChannelEnum.wecom,
              isProFn: true,
              group: 'thirdParty' as const,
              countKey: PublishChannelEnum.wecom as PublishChannelEnum.wecom
            }
          ]
        : []),
      ...(feConfigs?.show_publish_wechat !== false
        ? [
            {
              icon: 'core/app/publish/wechat',
              title: t('publish:wechat.bot'),
              value: PublishChannelEnum.wechat,
              isProFn: false,
              group: 'thirdParty' as const,
              countKey: PublishChannelEnum.wechat as PublishChannelEnum.wechat
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
              value: PublishChannelEnum.officialAccount,
              isProFn: true,
              group: 'thirdParty' as const,
              countKey: PublishChannelEnum.officialAccount as PublishChannelEnum.officialAccount
            }
          ]
        : [])
    ],
    [t, feConfigs, isPro, userInfo?.tags]
  );

  const [linkType, setLinkType] = useState<PublishChannelEnum>(PublishChannelEnum.share);
  const [isNativeChannelOpen, setIsNativeChannelOpen] = useState(true);
  const [isThirdPartyChannelOpen, setIsThirdPartyChannelOpen] = useState(true);

  return (
    <Flex h={'full'} borderTop={'1px solid'} borderColor={'myGray.200'}>
      <Box
        w={'220px'}
        h={'full'}
        borderRight={'1px solid'}
        borderColor={'myGray.200'}
        pt={4}
        pb={2.5}
        userSelect={'none'}
      >
        <Box px={2.5}>
          {[
            {
              name: t('publish:native_channels'),
              group: 'native',
              isOpen: isNativeChannelOpen,
              onClick: () => setIsNativeChannelOpen((state) => !state)
            },
            {
              name: t('publish:third_party_publish_channels'),
              group: 'thirdParty',
              isOpen: isThirdPartyChannelOpen,
              onClick: () => setIsThirdPartyChannelOpen((state) => !state)
            }
          ].map(({ name, group, isOpen, onClick }) => {
            const items = publishList
              .filter((item) => item.group === group)
              .sort((a, b) => {
                if (group !== 'thirdParty' || !outLinkCounts) return 0;
                return (
                  (b.countKey ? outLinkCounts[b.countKey] : 0) -
                  (a.countKey ? outLinkCounts[a.countKey] : 0)
                );
              });

            if (items.length === 0) return null;

            return (
              <Box key={group}>
                <Button
                  variant={'unstyled'}
                  display={'flex'}
                  w={'full'}
                  h={'auto'}
                  py={2}
                  pl={2}
                  pr={2}
                  fontSize={'sm'}
                  fontWeight={500}
                  rounded={'md'}
                  color={'myGray.700'}
                  cursor={'pointer'}
                  mb={0.5}
                  _hover={{
                    bg: 'rgba(17, 24, 36, 0.05)'
                  }}
                  justifyContent={'space-between'}
                  alignItems={'center'}
                  onClick={onClick}
                  aria-expanded={isOpen}
                  _focusVisible={{
                    bg: 'rgba(17, 24, 36, 0.05)'
                  }}
                >
                  <Box minW={0} fontWeight={'medium'} textAlign={'left'} whiteSpace={'normal'}>
                    {name}
                  </Box>
                  <MyIcon
                    name={'core/chat/chevronDown'}
                    w={'1rem'}
                    transform={isOpen ? undefined : 'rotate(-90deg)'}
                  />
                </Button>
                {isOpen &&
                  items.map((item) => (
                    <Button
                      key={item.value}
                      variant={'unstyled'}
                      display={'flex'}
                      w={'full'}
                      h={'auto'}
                      fontSize={'sm'}
                      fontWeight={500}
                      rounded={'md'}
                      py={2}
                      pl={'30px'}
                      pr={2}
                      cursor={'pointer'}
                      mb={0.5}
                      justifyContent={'space-between'}
                      {...(linkType === item.value
                        ? {
                            bg: 'primary.50',
                            color: 'primary.600',
                            _hover: { bg: 'primary.50' },
                            _focusVisible: { bg: 'primary.50' }
                          }
                        : {
                            bg: 'transparent',
                            color: 'myGray.500',
                            _hover: {
                              bg: 'rgba(17, 24, 36, 0.05)'
                            },
                            _focusVisible: {
                              bg: 'rgba(17, 24, 36, 0.05)'
                            }
                          })}
                      onClick={() => {
                        if (!feConfigs.isPlus && item.isProFn) {
                          setShowProModal(true);
                        } else {
                          setLinkType(item.value);
                        }
                      }}
                      aria-pressed={linkType === item.value}
                      alignItems={'center'}
                    >
                      <Avatar src={item.icon} w={'1rem'} mr={1} />
                      <Box flex={1} minW={0} textAlign={'left'} whiteSpace={'normal'}>
                        {item.title}
                      </Box>
                      {item.countKey && outLinkCounts && outLinkCounts[item.countKey] > 0 && (
                        <Box
                          ml={'auto'}
                          bg={'rgba(17, 24, 36, 0.15)'}
                          color={'white'}
                          w={4}
                          h={4}
                          borderRadius={'full'}
                          textAlign={'center'}
                          lineHeight={4}
                          fontWeight={500}
                          fontSize={11}
                          flexShrink={0}
                        >
                          {outLinkCounts[item.countKey]}
                        </Box>
                      )}
                    </Button>
                  ))}
              </Box>
            );
          })}
        </Box>
      </Box>

      <Box flex={1} minW={0} overflowY={'auto'}>
        {linkType === PublishChannelEnum.share && (
          <Link
            appId={appId}
            type={PublishChannelEnum.share}
            onRefreshOutLinkCounts={refetchOutLinkCounts}
          />
        )}
        {linkType === PublishChannelEnum.apikey && <API appId={appId} />}
        {linkType === PublishChannelEnum.feishu && (
          <FeiShu appId={appId} onRefreshOutLinkCounts={refetchOutLinkCounts} />
        )}
        {linkType === PublishChannelEnum.dingtalk && (
          <DingTalk appId={appId} onRefreshOutLinkCounts={refetchOutLinkCounts} />
        )}
        {linkType === PublishChannelEnum.wecom && (
          <Wecom appId={appId} onRefreshOutLinkCounts={refetchOutLinkCounts} />
        )}
        {linkType === PublishChannelEnum.officialAccount && (
          <OffiAccount appId={appId} onRefreshOutLinkCounts={refetchOutLinkCounts} />
        )}
        {linkType === PublishChannelEnum.wechat && (
          <Wechat appId={appId} onRefreshOutLinkCounts={refetchOutLinkCounts} />
        )}
        {linkType === PublishChannelEnum.playground && <Playground appId={appId} />}
      </Box>
    </Flex>
  );
};

export default OutLink;
