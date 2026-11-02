import { useEffect, useMemo, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/router';
import FillRowTabs from '@fastgpt/web/components/common/Tabs/FillRowTabs';
import { preloadImages } from '@fastgpt/web/components/common/Image/preloadImages';
import { useSafeTranslation } from '@fastgpt/web/hooks/useSafeTranslation';
import type { ChannelType } from '@fastgpt/global/core/ai/model/scope';
import { useUserModelStore } from '@/web/core/ai/model/useUserModelStore';

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
  renderCustomTab?: (tab: ModelTabType, TabNode: ReactNode) => ReactNode;
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
  const modelProviders = useUserModelStore((state) => state.modelProviders);

  /**
   * 供应商头像是对象存储上的绝对地址，每个 TAB 面板重新挂载时都会重新发请求，
   * 表现为图标晚于条目文字 0.5-1 秒出现。目录就绪后先统一预热，切 TAB 时直接命中缓存。
   */
  useEffect(() => {
    const avatars = Object.values(modelProviders ?? {}).flatMap((providerList) =>
      (providerList ?? []).map((provider) => provider.avatar)
    );
    void preloadImages(avatars);
  }, [modelProviders]);

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
