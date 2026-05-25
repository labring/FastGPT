import React, { useCallback, useMemo } from 'react';
import { AppContext, TabEnum } from './context';
import { useRouter } from 'next/router';
import { useTranslation } from 'next-i18next';
import { useContextSelector } from 'use-context-selector';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { MyTabs } from '@fastgpt/web/components/common/MyTabs';

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
            { label: t('app:logs_app_data'), value: TabEnum.dashboard },
            { label: t('app:chat_logs'), value: TabEnum.logs }
          ]
        : []),
      ...(appDetail.permission.hasManagePer
        ? [{ label: t('app:publish_channel'), value: TabEnum.publish }]
        : []),
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
      ...(appDetail.permission.hasReadChatLogPer
        ? [{ label: t('app:chat_logs'), value: TabEnum.logs }]
        : []),
      ...(appDetail.permission.hasManagePer
        ? [
            {
              label: t('app:publish_channel'),
              value: TabEnum.publish
            }
          ]
        : []),
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
    <MyTabs
      tabs={tabList}
      value={currentTab}
      onChange={(value) => setCurrentTab(value as TabEnum)}
    />
  );
};

export default RouteTab;
