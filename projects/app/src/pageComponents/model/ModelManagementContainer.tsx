import { useEffect, useMemo } from 'react';
import type React from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/router';
import FillRowTabs from '@fastgpt/web/components/common/Tabs/FillRowTabs';
import { useSafeTranslation } from '@fastgpt/web/hooks/useSafeTranslation';
import type { ChannelType } from '@fastgpt/global/core/ai/model/scope';

const ModelConfigTable = dynamic(() => import('@/pageComponents/model/ModelConfigTable'));
const ChannelTable = dynamic(() => import('@/pageComponents/model/Channel'));
const ChannelLog = dynamic(() => import('@/pageComponents/model/Log'));
const ModelDashboard = dynamic(() => import('@/pageComponents/model/ModelDashboard'));

export type ModelTabType =
  | 'active_model'
  | 'config'
  | 'channel'
  | 'channel_log'
  | 'account_model'
  | 'status';

type ModelManagementContainerProps = {
  channelType: ChannelType;
  scrollPositionKey?: string;
  defaultTab?: ModelTabType;
  customTabs?: { label: string; value: ModelTabType }[];
  renderCustomTab?: (tab: ModelTabType, TabNode: React.ReactNode) => React.ReactNode;
  onBeforeTabChange?: (targetTab: ModelTabType, options?: { silent?: boolean }) => boolean;
};

export const ModelManagementContainer = ({
  channelType,
  scrollPositionKey = `${channelType}-model-tabs`,
  defaultTab = 'config',
  customTabs,
  renderCustomTab,
  onBeforeTabChange
}: ModelManagementContainerProps) => {
  const { t } = useSafeTranslation();
  const router = useRouter();

  const baseTabList = useMemo<{ label: string; value: ModelTabType }[]>(
    () => [
      { label: t('config_model:config_model'), value: 'config' },
      { label: t('config_model:channel'), value: 'channel' },
      { label: t('config_model:log'), value: 'channel_log' },
      { label: t('config_model:monitoring'), value: 'account_model' }
    ],
    [t]
  );

  const modelTabList = customTabs ?? baseTabList;
  const queryModelTab = router.query.modelTab as ModelTabType | undefined;
  const targetTab = modelTabList.find((item) => item.value === queryModelTab)?.value;
  const isTargetTabAllowed =
    !targetTab || !onBeforeTabChange || onBeforeTabChange(targetTab, { silent: true });
  const modelTab = isTargetTabAllowed ? (targetTab ?? defaultTab) : defaultTab;

  useEffect(() => {
    if (!router.isReady || queryModelTab === undefined) return;
    if (typeof queryModelTab === 'string' && queryModelTab === modelTab) return;

    void router.replace(
      {
        pathname: router.pathname,
        query: {
          ...router.query,
          modelTab: defaultTab
        }
      },
      undefined,
      { shallow: true }
    );
  }, [defaultTab, modelTab, queryModelTab, router]);

  const TabNode = useMemo(
    () => (
      <FillRowTabs<ModelTabType>
        w={['100%', 'auto']}
        size={'sm'}
        scrollPositionKey={scrollPositionKey}
        list={modelTabList}
        value={modelTab}
        onChange={(value) => {
          if (onBeforeTabChange && !onBeforeTabChange(value)) {
            return;
          }
          void router.replace(
            {
              pathname: router.pathname,
              query: {
                ...router.query,
                modelTab: value
              }
            },
            undefined,
            { shallow: true }
          );
        }}
      />
    ),
    [modelTab, modelTabList, onBeforeTabChange, router, scrollPositionKey]
  );

  const customContent = renderCustomTab?.(modelTab, TabNode);
  if (customContent) {
    return <>{customContent}</>;
  }

  return (
    <>
      {modelTab === 'config' && <ModelConfigTable Tab={TabNode} channelType={channelType} />}
      {modelTab === 'channel' && <ChannelTable Tab={TabNode} channelType={channelType} />}
      {modelTab === 'channel_log' && <ChannelLog Tab={TabNode} channelType={channelType} />}
      {modelTab === 'account_model' && <ModelDashboard Tab={TabNode} channelType={channelType} />}
    </>
  );
};

export default ModelManagementContainer;
