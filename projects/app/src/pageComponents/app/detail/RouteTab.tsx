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

  const tabList = useMemo(
    () => [
      ...(appDetail.permission.hasWritePer
        ? [
            {
              label:
                appDetail.type === AppTypeEnum.workflowTool
                  ? t('app:setting_plugin')
                  : t('app:setting_app'),
              value: TabEnum.appEdit
            }
          ]
        : []),
      ...(appDetail.permission.hasManagePer
        ? [
            {
              label: t('app:publish_channel'),
              value: TabEnum.publish
            }
          ]
        : []),
      ...(appDetail.permission.hasReadChatLogPer
        ? [{ label: t('app:chat_logs'), value: TabEnum.logs }]
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

  return (
    <HStack borderRadius={'md'} bg={'rgba(244, 244, 245, 0.63)'} backdropBlur={'blur(5px)'} p={1}>
      {tabList.map((tab) => (
        <HStack
          key={tab.value}
          justifyContent={'center'}
          cursor={'pointer'}
          w={'196px'}
          h={8}
          fontSize={'12px'}
          fontWeight={'medium'}
          userSelect={'none'}
          {...(currentTab === tab.value
            ? {
                bg: 'white',
                boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
                color: 'black',
                borderRadius: '2px'
              }
            : {
                color: 'myGray.500',
                onClick: () => setCurrentTab(tab.value)
              })}
        >
          <Box>{tab.label}</Box>
        </HStack>
      ))}
    </HStack>
  );
};

export default RouteTab;
