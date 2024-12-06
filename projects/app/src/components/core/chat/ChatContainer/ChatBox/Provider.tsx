import React, { useState, useMemo, useCallback } from 'react';
import { useAudioPlay } from '@/web/common/utils/voice';
import { OutLinkChatAuthProps } from '@fastgpt/global/support/permission/chat';
import {
  AppAutoExecuteConfigType,
  AppFileSelectConfigType,
  AppTTSConfigType,
  AppWhisperConfigType,
  ChatInputGuideConfigType,
  VariableItemType
} from '@fastgpt/global/core/app/type';
import { ChatHistoryItemResType } from '@fastgpt/global/core/chat/type';
import {
  defaultAppSelectFileConfig,
  defaultAutoExecuteConfig,
  defaultChatInputGuideConfig,
  defaultTTSConfig,
  defaultWhisperConfig
} from '@fastgpt/global/core/app/constants';
import { createContext, useContextSelector } from 'use-context-selector';
import { VariableInputEnum } from '@fastgpt/global/core/workflow/constants';
import { getChatResData } from '@/web/core/chat/api';
import { ChatItemContext } from '@/web/core/chat/context/chatItemContext';
import { ChatRecordContext } from '@/web/core/chat/context/chatRecordContext';

export type ChatProviderProps = {
  appId: string;
  chatId: string;
  outLinkAuthData?: OutLinkChatAuthProps;

  chatType: 'log' | 'chat' | 'share' | 'team';
  showRawSource: boolean;
  showNodeStatus: boolean;
};

type useChatStoreType = ChatProviderProps & {
  welcomeText: string;
  variableList: VariableItemType[];
  allVariableList: VariableItemType[];
  questionGuide: boolean;
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

  appId: string;
  chatId: string;
  outLinkAuthData: OutLinkChatAuthProps;
};

export const ChatBoxContext = createContext<useChatStoreType>({
  welcomeText: '',
  variableList: [],
  questionGuide: false,
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
  outLinkAuthData: {},
  // @ts-ignore
  variablesForm: undefined
});

const Provider = ({
  appId,
  chatId,
  outLinkAuthData = {},
  chatType = 'chat',
  showRawSource,
  showNodeStatus,
  children,
  ...props
}: ChatProviderProps & {
  children: React.ReactNode;
}) => {
  const welcomeText = useContextSelector(
    ChatItemContext,
    (v) => v.chatBoxData?.app?.chatConfig?.welcomeText ?? ''
  );
  const variables = useContextSelector(
    ChatItemContext,
    (v) => v.chatBoxData?.app?.chatConfig?.variables ?? []
  );
  const questionGuide = useContextSelector(
    ChatItemContext,
    (v) => v.chatBoxData?.app?.chatConfig?.questionGuide ?? false
  );
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
    ...outLinkAuthData
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
          ...outLinkAuthData
        });
        setChatRecords((state) =>
          state.map((item) => (item.dataId === dataId ? { ...item, responseData: resData } : item))
        );
        return resData;
      }
    },
    [chatRecords, chatId, appId, outLinkAuthData, setChatRecords]
  );
  const value: useChatStoreType = {
    ...props,
    welcomeText,
    variableList: variables.filter((item) => item.type !== VariableInputEnum.custom),
    allVariableList: variables,
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
    appId,
    chatId,
    outLinkAuthData,
    getHistoryResponseData,
    chatType,
    showRawSource,
    showNodeStatus
  };

  return <ChatBoxContext.Provider value={value}>{children}</ChatBoxContext.Provider>;
};

export default React.memo(Provider);
