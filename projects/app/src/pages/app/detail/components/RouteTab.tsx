import { Box, HStack } from '@chakra-ui/react';
import React, { useCallback, useMemo } from 'react';
import { AppContext, TabEnum } from './context';
import { useRouter } from 'next/router';
import { useTranslation } from 'next-i18next';
import { useI18n } from '@/web/context/I18n';
import { useContextSelector } from 'use-context-selector';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';

const RouteTab = () => {
  const { t } = useTranslation();
  const { appT } = useI18n();
  const router = useRouter();
  const { appDetail, currentTab } = useContextSelector(AppContext, (v) => v);

  const setCurrentTab = useCallback(
    (tab: TabEnum) => {
      router.push({
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
      {
        label: appDetail.type === AppTypeEnum.plugin ? appT('Setting plugin') : appT('Setting app'),
        id: TabEnum.appEdit
      },
      ...(appDetail.permission.hasManagePer
        ? [
            {
              label: appT('Publish channel'),
              id: TabEnum.publish
            },
            { label: appT('Chat logs'), id: TabEnum.logs }
          ]
        : [])
    ],
    [appDetail.permission.hasManagePer, appT]
  );

  return (
    <HStack spacing={4} whiteSpace={'nowrap'}>
      {tabList.map((tab) => (
        <Box
          key={tab.id}
          px={2}
          py={0.5}
          {...(currentTab === tab.id
            ? {
                color: 'primary.700'
              }
            : {
                color: 'myGray.600',
                cursor: 'pointer',
                _hover: {
                  bg: 'myGray.200',
                  borderRadius: 'md'
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
