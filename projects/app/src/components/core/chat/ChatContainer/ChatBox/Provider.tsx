import React, { useState, useMemo, useCallback } from 'react';
import { useAudioPlay } from '@/web/common/utils/voice';
import { type OutLinkChatAuthProps } from '@fastgpt/global/support/permission/chat';
import {
  type AppFileSelectConfigType,
  type AppQGConfigType,
  type AppTTSConfigType,
  type AppWhisperConfigType,
  type ChatInputGuideConfigType,
  type VariableItemType
} from '@fastgpt/global/core/app/type';
import { type ChatHistoryItemResType } from '@fastgpt/global/core/chat/type';
import {
  defaultAppSelectFileConfig,
  defaultChatInputGuideConfig,
  defaultQGConfig,
  defaultTTSConfig,
  defaultWhisperConfig
} from '@fastgpt/global/core/app/constants';
import { createContext, useContextSelector } from 'use-context-selector';
import { VariableInputEnum } from '@fastgpt/global/core/workflow/constants';
import { getChatResData } from '@/web/core/chat/api';
import { ChatItemContext } from '@/web/core/chat/context/chatItemContext';
import { ChatRecordContext } from '@/web/core/chat/context/chatRecordContext';
import { useCreation } from 'ahooks';
import type { ChatTypeEnum } from './constants';
import type { ChatQuickAppType } from '@fastgpt/global/core/chat/setting/type';
import { WorkflowRuntimeContextProvider } from '@/components/core/chat/ChatContainer/context/workflowRuntimeContext';

export type ChatProviderProps = {
  appId: string;
  chatId: string;
  outLinkAuthData?: OutLinkChatAuthProps;

  InputLeftComponent?: React.ReactNode;

  chatType: ChatTypeEnum;
  dialogTips?: string;
  wideLogo?: string;
  slogan?: string;

  currentQuickAppId?: string;
  quickAppList?: ChatQuickAppType[];
  onSwitchQuickApp?: (appId: string) => Promise<void>;
};

type useChatStoreType = Omit<ChatProviderProps, 'appId' | 'chatId' | 'outLinkAuthData'> & {
  welcomeText: string;
  variableList: VariableItemType[];
  questionGuide: AppQGConfigType;
  ttsConfig: AppTTSConfigType;
  whisperConfig: AppWhisperConfigType;
  autoTTSResponse: boolean;
  startSegmentedAudio: () => Promise<any>;
  splitText2Audio: (text: string, done?: boolean | undefined) => void;
  finishSegmentedAudio: () => void;
  audioLoading: boolean;
  audioPlaying: boolean;
  hasAudio: boolean;
  playAudioByText: ({
    text,
    buffer
  }: {
    text: string;
    buffer?: Uint8Array | undefined;
  }) => Promise<{
    buffer?: Uint8Array | undefined;
  }>;
  cancelAudio: () => void;
  audioPlayingChatId: string | undefined;
  setAudioPlayingChatId: React.Dispatch<React.SetStateAction<string | undefined>>;
  isChatting: boolean;
  chatInputGuide: ChatInputGuideConfigType;
  getHistoryResponseData: ({ dataId }: { dataId: string }) => Promise<ChatHistoryItemResType[]>;
  fileSelectConfig: AppFileSelectConfigType;
};

export const ChatBoxContext = createContext<useChatStoreType>({
  welcomeText: '',
  variableList: [],
  questionGuide: {
    open: false,
    model: undefined,
    customPrompt: undefined
  },
  ttsConfig: {
    type: 'none',
    model: undefined,
    voice: undefined,
    speed: undefined
  },
  whisperConfig: {
    open: false,
    autoSend: false,
    autoTTSResponse: false
  },
  autoTTSResponse: false,
  startSegmentedAudio: function (): Promise<any> {
    throw new Error('Function not implemented.');
  },
  splitText2Audio: function (text: string, done?: boolean | undefined): void {
    throw new Error('Function not implemented.');
  },
  isChatting: false,
  audioLoading: false,
  audioPlaying: false,
  hasAudio: false,
  playAudioByText: function ({
    text,
    buffer
  }: {
    text: string;
    buffer?: Uint8Array | undefined;
  }): Promise<{ buffer?: Uint8Array | undefined }> {
    throw new Error('Function not implemented.');
  },
  cancelAudio: function (): void {
    throw new Error('Function not implemented.');
  },
  audioPlayingChatId: undefined,
  setAudioPlayingChatId: function (value: React.SetStateAction<string | undefined>): void {
    throw new Error('Function not implemented.');
  },
  finishSegmentedAudio: function (): void {
    throw new Error('Function not implemented.');
  },
  chatInputGuide: {
    open: false,
    customUrl: ''
  },
  // @ts-ignore
  variablesForm: undefined
});

const Provider = ({
  appId,
  chatId,
  outLinkAuthData,
  chatType,
  children,
  ...props
}: ChatProviderProps & {
  children: React.ReactNode;
}) => {
  const formatOutLinkAuth = useCreation(() => {
    return outLinkAuthData || {};
  }, [outLinkAuthData]);

  const welcomeText = useContextSelector(
    ChatItemContext,
    (v) => v.chatBoxData?.app?.chatConfig?.welcomeText ?? ''
  );
  const variables = useContextSelector(
    ChatItemContext,
    (v) => v.chatBoxData?.app?.chatConfig?.variables ?? []
  );
  const questionGuide = useContextSelector(ChatItemContext, (v) => {
    const val = v.chatBoxData?.app?.chatConfig?.questionGuide;
    if (typeof val === 'boolean') {
      return {
        ...defaultQGConfig,
        open: val
      };
    }
    return v.chatBoxData?.app?.chatConfig?.questionGuide ?? defaultQGConfig;
  });
  const ttsConfig = useContextSelector(
    ChatItemContext,
    (v) => v.chatBoxData?.app?.chatConfig?.ttsConfig ?? defaultTTSConfig
  );
  const whisperConfig = useContextSelector(
    ChatItemContext,
    (v) => v.chatBoxData?.app?.chatConfig?.whisperConfig ?? defaultWhisperConfig
  );
  const chatInputGuide = useContextSelector(
    ChatItemContext,
    (v) => v.chatBoxData?.app?.chatConfig?.chatInputGuide ?? defaultChatInputGuideConfig
  );
  const fileSelectConfig = useContextSelector(
    ChatItemContext,
    (v) => v.chatBoxData?.app?.chatConfig?.fileSelectConfig ?? defaultAppSelectFileConfig
  );

  const chatRecords = useContextSelector(ChatRecordContext, (v) => v.chatRecords);
  const setChatRecords = useContextSelector(ChatRecordContext, (v) => v.setChatRecords);

  // segment audio
  const [audioPlayingChatId, setAudioPlayingChatId] = useState<string>();
  const {
    audioLoading,
    audioPlaying,
    hasAudio,
    playAudioByText,
    cancelAudio,
    startSegmentedAudio,
    finishSegmentedAudio,
    splitText2Audio
  } = useAudioPlay({
    appId,
    ttsConfig,
    ...formatOutLinkAuth
  });

  const autoTTSResponse =
    whisperConfig?.open && whisperConfig?.autoSend && whisperConfig?.autoTTSResponse && hasAudio;

  const isChatting = useMemo(
    () =>
      chatRecords[chatRecords.length - 1] &&
      chatRecords[chatRecords.length - 1]?.status !== 'finish',
    [chatRecords]
  );
  const getHistoryResponseData = useCallback(
    async ({ dataId }: { dataId: string }) => {
      const aimItem = chatRecords.find((item) => item.dataId === dataId)!;
      if (!!aimItem?.responseData || !chatId) {
        return aimItem.responseData || [];
      } else {
        let resData = await getChatResData({
          appId: appId,
          chatId: chatId,
          dataId,
          ...formatOutLinkAuth
        });
        setChatRecords((state) =>
          state.map((item) => (item.dataId === dataId ? { ...item, responseData: resData } : item))
        );
        return resData;
      }
    },
    [chatRecords, chatId, appId, formatOutLinkAuth, setChatRecords]
  );
  const value: useChatStoreType = {
    ...props,
    welcomeText,
    variableList: variables,
    questionGuide,
    ttsConfig,
    fileSelectConfig,
    whisperConfig,
    autoTTSResponse,
    startSegmentedAudio,
    finishSegmentedAudio,
    splitText2Audio,
    audioLoading,
    audioPlaying,
    hasAudio,
    playAudioByText,
    cancelAudio,
    audioPlayingChatId,
    setAudioPlayingChatId,
    isChatting,
    chatInputGuide,
    getHistoryResponseData,
    chatType
  };

  return (
    <WorkflowRuntimeContextProvider
      appId={appId}
      chatId={chatId}
      outLinkAuthData={formatOutLinkAuth}
    >
      <ChatBoxContext.Provider value={value}>{children}</ChatBoxContext.Provider>
    </WorkflowRuntimeContextProvider>
  );
};

export default React.memo(Provider);
