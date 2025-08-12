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
import { useCallback, useMemo, useState } from 'react';
import { createContext } from 'use-context-selector';

type ChatSettingReturnType = ChatSettingSchema | undefined;

export type ChatSettingContextValue = {
  pane: ChatSidebarPaneEnum;
  handlePaneChange: (pane: ChatSidebarPaneEnum) => void;
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

  const { feConfigs } = useSystemStore();
  const { appId, setLastPane, lastPane } = useChatStore();

  const [collapse, setCollapse] = useState<CollapseStatusType>(defaultCollapseStatus);

  const { data: chatSettings, runAsync: refreshChatSetting } = useRequest2<
    ChatSettingReturnType,
    []
  >(
    async () => {
      if (!feConfigs.isPlus) return;
      const settings = await getChatSetting();
      return settings;
    },
    {
      manual: false,
      refreshDeps: [feConfigs.isPlus]
    }
  );

  const [pane, setPane] = useState<ChatSidebarPaneEnum>(
    lastPane ??
      (feConfigs.isPlus ? ChatSidebarPaneEnum.HOME : ChatSidebarPaneEnum.RECENTLY_USED_APPS)
  );
  const handlePaneChange = useCallback(
    (newPane: ChatSidebarPaneEnum) => {
      // 如果切换到首页，且当前不是隐藏应用，则切换到隐藏应用
      const hiddenAppId = chatSettings?.appId;
      if (newPane === ChatSidebarPaneEnum.HOME && hiddenAppId && appId !== hiddenAppId) {
        router.push({
          query: {
            ...router.query,
            appId: hiddenAppId
          }
        });
      }
      setPane(newPane);
      setLastPane(newPane);
    },
    [setLastPane, chatSettings?.appId, appId, router]
  );

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
