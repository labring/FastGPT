import { useSystemStore } from '@/web/common/system/useSystemStore';
import type { ChatAllAppTabEnum, ChatSettingTabOptionEnum } from '@/pageComponents/chat/constants';
import {
  ChatSidebarPaneEnum,
  defaultCollapseStatus,
  type CollapseStatusType
} from '@/pageComponents/chat/constants';
import { getChatSetting } from '@/web/core/chat/api';
import { useChatStore } from '@/web/core/chat/context/useChatStore';
import type { ChatSettingType } from '@fastgpt/global/core/chat/setting/type';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { useRouter } from 'next/router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createContext } from 'use-context-selector';
import { useMemoEnhance } from '@fastgpt/web/hooks/useMemoEnhance';
import { getRecentlyUsedApps } from '@/web/core/chat/api';
import { useUserStore } from '@/web/support/user/useUserStore';
import { useLatest, useMemoizedFn, useMount } from 'ahooks';
import type { GetRecentlyUsedAppsResponseType } from '@fastgpt/global/openapi/core/chat/api';
import type { UserType } from '@fastgpt/global/support/user/type';

export type ChatPageContextValue = {
  // Pane & collapse
  pane: ChatSidebarPaneEnum;
  handlePaneChange: (
    pane: ChatSidebarPaneEnum,
    _id?: string,
    _tab?: ChatSettingTabOptionEnum | ChatAllAppTabEnum
  ) => void;
  collapse: CollapseStatusType;
  onTriggerCollapse: () => void;
  // Chat settings
  chatSettings: ChatSettingType | undefined;
  refreshChatSetting: () => Promise<ChatSettingType | undefined>;
  logos: { wideLogoUrl?: string; squareLogoUrl?: string };

  // User & apps
  isInitedUser: boolean;
  userInfo: UserType | null;
  myApps: GetRecentlyUsedAppsResponseType;
  refreshRecentlyUsed: (appId: string) => void;
};

export const ChatPageContext = createContext<ChatPageContextValue>({
  pane: ChatSidebarPaneEnum.HOME,
  handlePaneChange: () => {},
  collapse: defaultCollapseStatus,
  onTriggerCollapse: () => {},
  chatSettings: undefined,
  logos: { wideLogoUrl: '', squareLogoUrl: '' },
  refreshChatSetting: function (): Promise<ChatSettingType | undefined> {
    throw new Error('Function not implemented.');
  },
  isInitedUser: false,
  userInfo: null,
  myApps: [],
  refreshRecentlyUsed: () => {}
});

export const ChatPageContextProvider = ({
  appId: routeAppId,
  children
}: {
  appId: string;
  children: React.ReactNode;
}) => {
  const router = useRouter();
  const { feConfigs } = useSystemStore();
  const {
    appId: activeAppId,
    setSource,
    setAppId,
    setLastPane,
    setLastChatAppId,
    lastPane
  } = useChatStore();
  const { userInfo } = useUserStore();

  const { pane = lastPane || ChatSidebarPaneEnum.HOME } = router.query as {
    pane: ChatSidebarPaneEnum;
  };

  const [collapse, setCollapse] = useState<CollapseStatusType>(defaultCollapseStatus);
  // Home App 是门户页背后的隐藏应用；缓存它的 id，避免移动/桌面切换时被最近使用列表短暂暴露。
  const [cachedHomeAppId, setCachedHomeAppId] = useState('');

  // 进入页面或切换成员时拉取一次，已在列表中的应用不因点击、对话或计时而刷新。
  const { data: myApps = [], refreshAsync: requestRecentlyUsed } = useRequest(
    () => getRecentlyUsedApps(),
    {
      manual: false,
      ready: !!userInfo,
      errorToast: '',
      refreshDeps: [userInfo?.team?.tmbId]
    }
  );

  // Initialize chat page state
  useMount(async () => {
    setSource('online');
    if (routeAppId) setAppId(routeAppId);
  });

  // Sync appId to store as route/appId changes
  useEffect(() => {
    if (routeAppId) {
      setAppId(routeAppId);
    }
  }, [routeAppId, setAppId]);

  const { data: chatSettings, runAsync: refreshChatSetting } = useRequest(
    async () => {
      if (!feConfigs.isPlus) return;
      return await getChatSetting();
    },
    {
      manual: false,
      ready: !!userInfo && !!feConfigs.isPlus,
      refreshDeps: [feConfigs.isPlus, userInfo?.team?.tmbId],
      onSuccess: (data) => {
        if (!data) return;

        if (!data.enableHome && pane === ChatSidebarPaneEnum.HOME) {
          handlePaneChange(ChatSidebarPaneEnum.ALL_APPS);
          return;
        }

        if (
          pane === ChatSidebarPaneEnum.HOME &&
          routeAppId !== data.appId &&
          data.quickAppList.every((q) => q._id !== routeAppId)
        ) {
          handlePaneChange(ChatSidebarPaneEnum.HOME, data.appId);
        }
      }
    }
  );

  const homeAppId =
    chatSettings?.appId ||
    cachedHomeAppId ||
    (feConfigs.isPlus && pane === ChatSidebarPaneEnum.HOME ? activeAppId : '');

  /* eslint-disable react-hooks/set-state-in-effect -- 隐藏应用 id 需跨配置请求缓存，并在商业能力关闭时清理。 */
  useEffect(() => {
    if (!feConfigs.isPlus) {
      setCachedHomeAppId('');
      return;
    }

    const nextHomeAppId = chatSettings?.appId;

    if (!nextHomeAppId) return;

    setCachedHomeAppId((current) => (current === nextHomeAppId ? current : nextHomeAppId));
  }, [chatSettings?.appId, feConfigs.isPlus]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const displayedMyApps = useMemo(
    () => myApps.filter((app) => app.appId !== homeAppId),
    [homeAppId, myApps]
  );

  /** 对话正常结束后，仅在当前列表缺少该应用时刷新；失败保留原列表，供下一轮重试。 */
  const refreshRecentlyUsed = useMemoizedFn((appId: string) => {
    const tmbId = userInfo?.team?.tmbId;
    if (!tmbId || !appId || appId === homeAppId || myApps.some((app) => app.appId === appId)) {
      return;
    }

    // 请求层 maxQuantity: 1 取消重叠旧请求，去重只依据最新列表，不保留已刷新应用的记录。
    void requestRecentlyUsed().catch(() => {});
  });

  const lastestPane = useLatest(pane);
  const handlePaneChange = useCallback(
    async (
      newPane: ChatSidebarPaneEnum,
      id?: string,
      tab?: ChatSettingTabOptionEnum | ChatAllAppTabEnum
    ) => {
      if (newPane === lastestPane.current && !id && !tab) return;

      const _id = (() => {
        if (id) return id;

        const hiddenAppId = chatSettings?.appId;
        if (newPane === ChatSidebarPaneEnum.HOME && hiddenAppId) {
          return hiddenAppId;
        }

        return '';
      })();

      // 切换应用时同步更新 store，避免 URL / page props 已变但 chatId、chatBoxData 仍停留在上一应用
      if (_id) {
        setAppId(_id);
      }

      await router.replace(
        {
          query: {
            ...router.query,
            appId: _id,
            pane: newPane,
            tab
          }
        },
        undefined,
        { shallow: true }
      );

      setLastPane(newPane);
      setLastChatAppId(_id);
    },
    [lastestPane, router, setAppId, setLastPane, setLastChatAppId, chatSettings?.appId]
  );

  useEffect(() => {
    if (Object.values(ChatSidebarPaneEnum).includes(pane)) return;

    handlePaneChange(feConfigs.isPlus ? ChatSidebarPaneEnum.HOME : ChatSidebarPaneEnum.ALL_APPS);
  }, [feConfigs.isPlus, handlePaneChange, pane]);

  useEffect(() => {
    if (feConfigs.isPlus) return;

    if (![ChatSidebarPaneEnum.ALL_APPS, ChatSidebarPaneEnum.RECENTLY_USED_APPS].includes(pane)) {
      handlePaneChange(ChatSidebarPaneEnum.ALL_APPS);
    }
  }, [feConfigs.isPlus, handlePaneChange, pane]);

  const logos: Pick<ChatSettingType, 'wideLogoUrl' | 'squareLogoUrl'> = useMemo(
    () => ({
      wideLogoUrl: chatSettings?.wideLogoUrl,
      squareLogoUrl: chatSettings?.squareLogoUrl
    }),
    [chatSettings?.squareLogoUrl, chatSettings?.wideLogoUrl]
  );

  const onTriggerCollapse = useCallback(() => {
    setCollapse(collapse === 0 ? 1 : 0);
  }, [collapse]);

  const value: ChatPageContextValue = useMemoEnhance(
    () => ({
      pane,
      handlePaneChange,
      collapse,
      onTriggerCollapse,
      chatSettings,
      refreshChatSetting,
      logos,
      isInitedUser: true,
      userInfo,
      myApps: displayedMyApps,
      refreshRecentlyUsed
    }),
    [
      pane,
      handlePaneChange,
      collapse,
      onTriggerCollapse,
      chatSettings,
      refreshChatSetting,
      logos,
      userInfo,
      displayedMyApps,
      refreshRecentlyUsed
    ]
  );

  return <ChatPageContext.Provider value={value}>{children}</ChatPageContext.Provider>;
};
