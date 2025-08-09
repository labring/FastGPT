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
import { createContext, useCallback, useContext, useState } from 'react';

type ChatSettingReturnType = ChatSettingSchema | undefined;

export type ChatSettingContextValue = {
  pane: ChatSidebarPaneEnum;
  handlePaneChange: (pane: ChatSidebarPaneEnum) => void;
  collapse: CollapseStatusType;
  setCollapse: (collapse: CollapseStatusType) => void;
  chatSettings: ChatSettingSchema | undefined;
  refreshChatSetting: () => Promise<ChatSettingReturnType>;
  logos: Pick<ChatSettingSchema, 'wideLogoUrl' | 'squareLogoUrl'>;
};

const ChatSettingContext = createContext<ChatSettingContextValue | null>(null);

export const useChatSettingContext = () => {
  const context = useContext(ChatSettingContext);
  if (!context) {
    throw new Error('useChatSettingContext must be used within a ChatSettingContextProvider');
  }
  return context;
};

export const ChatSettingContextProvider = ({ children }: { children: React.ReactNode }) => {
  const router = useRouter();

  const { feConfigs } = useSystemStore();
  const { appId, setLastPane } = useChatStore();

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
    !!feConfigs.isPlus ? ChatSidebarPaneEnum.HOME : ChatSidebarPaneEnum.RECENTLY_USED_APPS
  );
  const handlePaneChange = useCallback(
    (newPane: ChatSidebarPaneEnum) => {
      setPane(newPane);
      setLastPane(newPane);

      // 如果切换到首页，且当前不是隐藏应用，则切换到隐藏应用
      const hiddenAppId = chatSettings?.appId;
      if (newPane === ChatSidebarPaneEnum.HOME && hiddenAppId && appId !== hiddenAppId) {
        router.replace({
          pathname: router.pathname,
          query: {
            ...router.query,
            appId: hiddenAppId
          }
        });
      }
    },
    [setLastPane, chatSettings?.appId, appId, router]
  );

  const logos: Pick<ChatSettingSchema, 'wideLogoUrl' | 'squareLogoUrl'> = {
    wideLogoUrl: chatSettings?.wideLogoUrl,
    squareLogoUrl: chatSettings?.squareLogoUrl
  };

  const value: ChatSettingContextValue = {
    pane,
    handlePaneChange,
    collapse,
    setCollapse,
    chatSettings,
    refreshChatSetting,
    logos
  };

  return <ChatSettingContext.Provider value={value}>{children}</ChatSettingContext.Provider>;
};
