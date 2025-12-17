import { Box, HStack } from '@chakra-ui/react';
import React, { useCallback, useMemo } from 'react';
import { AppContext, TabEnum } from './context';
import { useRouter } from 'next/router';
import { useTranslation } from 'next-i18next';
import { useContextSelector } from 'use-context-selector';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';

const RouteTab = () => {
  const { t } = useTranslation();
  const router = useRouter();
  const { appDetail, currentTab } = useContextSelector(AppContext, (v) => v);

  const setCurrentTab = useCallback(
    (tab: TabEnum) => {
      router.replace({
        query: {
          ...router.query,
          currentTab: tab
        }
      });
    },
    [router]
  );

  const assistantTabList = useMemo(() => {
    const allTabs = [
      ...(appDetail.permission.hasReadChatLogPer
        ? [
            { label: t('app:logs_app_data'), id: TabEnum.dashboard },
            { label: t('app:chat_logs'), id: TabEnum.logs }
          ]
        : []),
      { label: t('app:auto_learning'), id: TabEnum.autoLearn },
      ...(appDetail.permission.hasWritePer
        ? [
            {
              label:
                appDetail.type === AppTypeEnum.plugin
                  ? t('app:setting_plugin')
                  : t('app:setting_app'),
              id: TabEnum.appEdit
            }
          ]
        : []),
      ...(appDetail.permission.hasManagePer
        ? [{ label: t('app:publish_channel'), id: TabEnum.publish }]
        : [])
    ];

    return allTabs;
  }, [
    appDetail.permission.hasManagePer,
    appDetail.permission.hasReadChatLogPer,
    appDetail.permission.hasWritePer,
    appDetail.type,
    t
  ]);

  const otherTypeTabList = useMemo(
    () => [
      ...(appDetail.permission.hasWritePer
        ? [
            {
              label:
                appDetail.type === AppTypeEnum.plugin
                  ? t('app:setting_plugin')
                  : t('app:setting_app'),
              id: TabEnum.appEdit
            }
          ]
        : []),
      ...(appDetail.permission.hasManagePer
        ? [
            {
              label: t('app:publish_channel'),
              id: TabEnum.publish
            }
          ]
        : []),
      ...(appDetail.permission.hasReadChatLogPer
        ? [{ label: t('app:chat_logs'), id: TabEnum.logs }]
        : [])
    ],
    [
      appDetail.permission.hasManagePer,
      appDetail.permission.hasReadChatLogPer,
      appDetail.permission.hasWritePer,
      appDetail.type,
      t
    ]
  );

  const tabList = useMemo(
    () => (appDetail.type === AppTypeEnum.assistant ? assistantTabList : otherTypeTabList),
    [appDetail.type, assistantTabList, otherTypeTabList]
  );

  return (
    <HStack spacing={4} whiteSpace={'nowrap'}>
      {tabList.map((tab) => (
        <Box
          key={tab.id}
          px={2}
          py={0.5}
          fontWeight={'medium'}
          borderRadius={'sm'}
          {...(currentTab === tab.id
            ? {
                color: 'primary.700'
              }
            : {
                color: 'myGray.600',
                cursor: 'pointer',
                _hover: {
                  bg: 'myGray.200'
                },
                onClick: () => setCurrentTab(tab.id)
              })}
        >
          {tab.label}
        </Box>
      ))}
    </HStack>
  );
};

export default RouteTab;
