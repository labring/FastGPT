import { useSystemStore } from '@/web/common/system/useSystemStore';
import {
  ChatSidebarPaneEnum,
  defaultCollapseStatus,
  type CollapseStatusType
} from '@/pageComponents/chat/constants';
import { getChatSetting } from '@/web/core/chat/api';
import { useChatStore } from '@/web/core/chat/context/useChatStore';
import type { ChatSettingSchema } from '@fastgpt/global/core/chat/setting/type';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { useRouter } from 'next/router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { createContext } from 'use-context-selector';
import { usePathname } from 'next/navigation';

type ChatSettingReturnType = ChatSettingSchema | undefined;

export type ChatSettingContextValue = {
  pane: ChatSidebarPaneEnum;
  handlePaneChange: (pane: ChatSidebarPaneEnum, _id?: string) => void;
  collapse: CollapseStatusType;
  onTriggerCollapse: () => void;
  chatSettings: ChatSettingSchema | undefined;
  refreshChatSetting: () => Promise<ChatSettingReturnType>;
  logos: Pick<ChatSettingSchema, 'wideLogoUrl' | 'squareLogoUrl'>;
};

export const ChatSettingContext = createContext<ChatSettingContextValue>({
  pane: ChatSidebarPaneEnum.HOME,
  handlePaneChange: () => {},
  collapse: defaultCollapseStatus,
  onTriggerCollapse: () => {},
  chatSettings: undefined,
  refreshChatSetting: function (): Promise<ChatSettingReturnType> {
    throw new Error('Function not implemented.');
  },
  logos: {
    wideLogoUrl: '',
    squareLogoUrl: ''
  }
});

export const ChatSettingContextProvider = ({ children }: { children: React.ReactNode }) => {
  const router = useRouter();
  const pathname = usePathname();
  const { feConfigs } = useSystemStore();
  const { appId, setLastPane, setLastChatAppId, lastPane } = useChatStore();

  const { pane = lastPane || ChatSidebarPaneEnum.HOME } = (
    pathname === '/chat/share' ? { pane: ChatSidebarPaneEnum.RECENTLY_USED_APPS } : router.query
  ) as { pane: ChatSidebarPaneEnum };

  const [collapse, setCollapse] = useState<CollapseStatusType>(defaultCollapseStatus);

  const { data: chatSettings, runAsync: refreshChatSetting } = useRequest2(
    async () => {
      if (!feConfigs.isPlus) return;
      return await getChatSetting();
    },
    {
      manual: false,
      refreshDeps: [feConfigs.isPlus],
      onSuccess(data) {
        if (!data) return;

        // Reset home page appId
        if (pane === ChatSidebarPaneEnum.HOME && appId !== data.appId) {
          handlePaneChange(ChatSidebarPaneEnum.HOME, data.appId);
        }
      }
    }
  );

  const handlePaneChange = useCallback(
    async (newPane: ChatSidebarPaneEnum, id?: string) => {
      if (newPane === pane && !id) return;

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
          pane: newPane
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

  const logos: Pick<ChatSettingSchema, 'wideLogoUrl' | 'squareLogoUrl'> = useMemo(
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
