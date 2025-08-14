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
  handlePaneChange: (pane: ChatSidebarPaneEnum, _id?: string) => void;
  collapse: CollapseStatusType;
  onTriggerCollapse: () => void;
  chatSettings: ChatSettingSchema | undefined;
  refreshChatSetting: () => Promise<ChatSettingReturnType>;
  logos: Pick<ChatSettingSchema, 'wideLogoUrl' | 'squareLogoUrl'>;
  isLoadingChatSetting: boolean;
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
  },
  isLoadingChatSetting: false
});

export const ChatSettingContextProvider = ({ children }: { children: React.ReactNode }) => {
  const router = useRouter();
  const queryPane = router.query.pane as ChatSidebarPaneEnum | undefined;
  const { feConfigs } = useSystemStore();
  const { appId, setLastPane, lastPane } = useChatStore();

  const [collapse, setCollapse] = useState<CollapseStatusType>(defaultCollapseStatus);

  const {
    loading: isLoadingChatSetting,
    data: chatSettings,
    runAsync: refreshChatSetting
  } = useRequest2<ChatSettingReturnType, []>(
    async () => {
      if (!feConfigs.isPlus) return;
      const settings = await getChatSetting();
      return settings;
    },
    {
      manual: false,
      refreshDeps: [feConfigs.isPlus],
      onSuccess(data) {
        if (!data || appId === data.appId) return;
        if (queryPane !== ChatSidebarPaneEnum.HOME) return;
        handlePaneChange(ChatSidebarPaneEnum.HOME, data.appId);
      }
    }
  );

  const [pane, setPane] = useState<ChatSidebarPaneEnum>(() => {
    if (queryPane && Object.values(ChatSidebarPaneEnum).includes(queryPane)) return queryPane;
    if (lastPane) return lastPane;
    return feConfigs.isPlus ? ChatSidebarPaneEnum.HOME : ChatSidebarPaneEnum.RECENTLY_USED_APPS;
  });
  const handlePaneChange = useCallback(
    async (newPane: ChatSidebarPaneEnum, id?: string) => {
      if (newPane === pane && !id) return;
      const _id = (() => {
        if (id) return id;
        const hiddenAppId = chatSettings?.appId;
        if (newPane === ChatSidebarPaneEnum.HOME && hiddenAppId && appId !== hiddenAppId) {
          return hiddenAppId;
        }
        return appId;
      })();
      await router.replace({
        query: {
          appId: _id,
          pane: newPane
        }
      });
      setPane(newPane);
      setLastPane(newPane);
    },
    [setLastPane, chatSettings?.appId, appId, router, pane]
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
      logos,
      isLoadingChatSetting
    }),
    [
      pane,
      handlePaneChange,
      collapse,
      chatSettings,
      refreshChatSetting,
      logos,
      isLoadingChatSetting
    ]
  );

  return <ChatSettingContext.Provider value={value}>{children}</ChatSettingContext.Provider>;
};
