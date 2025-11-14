import { useSystemStore } from '@/web/common/system/useSystemStore';
import type { ChatSettingTabOptionEnum } from '@/pageComponents/chat/constants';
import {
  ChatSidebarPaneEnum,
  defaultCollapseStatus,
  type CollapseStatusType
} from '@/pageComponents/chat/constants';
import { getChatSetting } from '@/web/core/chat/api';
import { useChatStore } from '@/web/core/chat/context/useChatStore';
import type { ChatSettingType } from '@fastgpt/global/core/chat/setting/type';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { useRouter } from 'next/router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { createContext } from 'use-context-selector';

export type ChatSettingContextValue = {
  pane: ChatSidebarPaneEnum;
  handlePaneChange: (
    pane: ChatSidebarPaneEnum,
    _id?: string,
    _tab?: ChatSettingTabOptionEnum
  ) => void;
  collapse: CollapseStatusType;
  onTriggerCollapse: () => void;
  chatSettings: ChatSettingType | undefined;
  refreshChatSetting: () => Promise<ChatSettingType | undefined>;
  logos: { wideLogoUrl?: string; squareLogoUrl?: string };
};

export const ChatSettingContext = createContext<ChatSettingContextValue>({
  pane: ChatSidebarPaneEnum.HOME,
  handlePaneChange: () => {},
  collapse: defaultCollapseStatus,
  onTriggerCollapse: () => {},
  chatSettings: undefined,
  logos: { wideLogoUrl: '', squareLogoUrl: '' },
  refreshChatSetting: function (): Promise<ChatSettingType | undefined> {
    throw new Error('Function not implemented.');
  }
});

export const ChatSettingContextProvider = ({ children }: { children: React.ReactNode }) => {
  const router = useRouter();
  const { feConfigs } = useSystemStore();
  const { appId, setLastPane, setLastChatAppId, lastPane } = useChatStore();

  const { pane = lastPane || ChatSidebarPaneEnum.HOME } = router.query as {
    pane: ChatSidebarPaneEnum;
  };

  const [collapse, setCollapse] = useState<CollapseStatusType>(defaultCollapseStatus);

  const { data: chatSettings, runAsync: refreshChatSetting } = useRequest2(
    async () => {
      if (!feConfigs.isPlus) return;
      return await getChatSetting();
    },
    {
      manual: false,
      refreshDeps: [feConfigs.isPlus],
      onSuccess: (data) => {
        if (!data) return;

        if (!data.enableHome && pane === ChatSidebarPaneEnum.HOME) {
          handlePaneChange(ChatSidebarPaneEnum.TEAM_APPS);
          return;
        }

        if (
          pane === ChatSidebarPaneEnum.HOME &&
          appId !== data.appId &&
          data.quickAppList.every((q) => q._id !== appId)
        ) {
          handlePaneChange(ChatSidebarPaneEnum.HOME, data.appId);
        }
      }
    }
  );

  const handlePaneChange = useCallback(
    async (newPane: ChatSidebarPaneEnum, id?: string, tab?: ChatSettingTabOptionEnum) => {
      if (newPane === pane && !id && !tab) return;

      const _id = (() => {
        if (id) return id;

        const hiddenAppId = chatSettings?.appId;
        if (newPane === ChatSidebarPaneEnum.HOME && hiddenAppId) {
          return hiddenAppId;
        }

        return '';
      })();

      await router.replace({
        query: {
          ...router.query,
          appId: _id,
          pane: newPane,
          tab
        }
      });

      setLastPane(newPane);
      setLastChatAppId(_id);
    },
    [pane, router, setLastPane, setLastChatAppId, chatSettings?.appId]
  );

  useEffect(() => {
    if (!Object.values(ChatSidebarPaneEnum).includes(pane)) {
      handlePaneChange(ChatSidebarPaneEnum.HOME);
    }
  }, [pane, handlePaneChange]);

  const logos: Pick<ChatSettingType, 'wideLogoUrl' | 'squareLogoUrl'> = useMemo(
    () => ({
      wideLogoUrl: chatSettings?.wideLogoUrl,
      squareLogoUrl: chatSettings?.squareLogoUrl
    }),
    [chatSettings?.squareLogoUrl, chatSettings?.wideLogoUrl]
  );

  const value: ChatSettingContextValue = useMemo(
    () => ({
      pane,
      handlePaneChange,
      collapse,
      onTriggerCollapse: () => setCollapse(collapse === 0 ? 1 : 0),
      chatSettings,
      refreshChatSetting,
      logos
    }),
    [pane, handlePaneChange, collapse, chatSettings, refreshChatSetting, logos]
  );

  return <ChatSettingContext.Provider value={value}>{children}</ChatSettingContext.Provider>;
};
