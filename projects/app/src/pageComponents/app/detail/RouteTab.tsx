import { Box, HStack } from '@chakra-ui/react';
import React, { useCallback, useEffect, useMemo } from 'react';
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
      ...(appDetail.permission.hasLogPer ? [{ label: t('app:chat_logs'), id: TabEnum.logs }] : [])
    ],
    [
      appDetail.permission.hasLogPer,
      appDetail.permission.hasManagePer,
      appDetail.permission.hasWritePer,
      appDetail.type,
      t
    ]
  );

  useEffect(() => {
    // 没找到合适的 id，则自动跳转
    if (!tabList.find((item) => item.id === currentTab)) {
      setCurrentTab(tabList[0].id);
    }
  }, [tabList, currentTab, setCurrentTab]);

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
