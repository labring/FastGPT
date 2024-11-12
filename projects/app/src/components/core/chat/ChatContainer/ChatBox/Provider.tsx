import React, { useState, useMemo, useCallback } from 'react';
import { useAudioPlay } from '@/web/common/utils/voice';
import { OutLinkChatAuthProps } from '@fastgpt/global/support/permission/chat';
import {
  AppChatConfigType,
  AppFileSelectConfigType,
  AppTTSConfigType,
  AppWhisperConfigType,
  ChatInputGuideConfigType,
  VariableItemType
} from '@fastgpt/global/core/app/type';
import { ChatHistoryItemResType, ChatSiteItemType } from '@fastgpt/global/core/chat/type';
import {
  defaultAppSelectFileConfig,
  defaultChatInputGuideConfig,
  defaultTTSConfig,
  defaultWhisperConfig
} from '@fastgpt/global/core/app/constants';
import { createContext } from 'use-context-selector';
import { UseFormReturn } from 'react-hook-form';
import { VariableInputEnum } from '@fastgpt/global/core/workflow/constants';
import { getChatResData } from '@/web/core/chat/api';
import { ChatBoxInputFormType } from './type';

export type ChatProviderProps = OutLinkChatAuthProps & {
  appAvatar?: string;
  appId: string;
  chatConfig?: AppChatConfigType;

  chatHistories: ChatSiteItemType[];
  setChatHistories: React.Dispatch<React.SetStateAction<ChatSiteItemType[]>>;

  variablesForm: UseFormReturn<ChatBoxInputFormType, any>;

  // not chat test params
  chatId?: string;
  chatType?: 'log' | 'chat' | 'share' | 'team';
};

type useChatStoreType = OutLinkChatAuthProps &
  ChatProviderProps & {
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
    outLinkAuthData: OutLinkChatAuthProps;
    getHistoryResponseData: ({ dataId }: { dataId: string }) => Promise<ChatHistoryItemResType[]>;
    fileSelectConfig: AppFileSelectConfigType;
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
  chatHistories: [],
  setChatHistories: function (value: React.SetStateAction<ChatSiteItemType[]>): void {
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
  shareId,
  outLinkUid,
  teamId,
  teamToken,

  chatHistories,
  setChatHistories,
  variablesForm,
  chatType = 'chat',
  chatConfig = {},
  children,
  ...props
}: ChatProviderProps & {
  children: React.ReactNode;
}) => {
  const {
    welcomeText = '',
    variables = [],
    questionGuide = false,
    ttsConfig = defaultTTSConfig,
    whisperConfig = defaultWhisperConfig,
    chatInputGuide = defaultChatInputGuideConfig,
    fileSelectConfig = defaultAppSelectFileConfig
  } = useMemo(() => chatConfig, [chatConfig]);

  const outLinkAuthData = useMemo(
    () => ({
      shareId,
      outLinkUid,
      teamId,
      teamToken
    }),
    [shareId, outLinkUid, teamId, teamToken]
  );

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
    ttsConfig,
    ...outLinkAuthData
  });

  const autoTTSResponse =
    whisperConfig?.open && whisperConfig?.autoSend && whisperConfig?.autoTTSResponse && hasAudio;

  const isChatting = useMemo(
    () =>
      chatHistories[chatHistories.length - 1] &&
      chatHistories[chatHistories.length - 1]?.status !== 'finish',
    [chatHistories]
  );
  const getHistoryResponseData = useCallback(
    async ({ dataId }: { dataId: string }) => {
      const aimItem = chatHistories.find((item) => item.dataId === dataId)!;
      if (!!aimItem?.responseData || !props.chatId) {
        return aimItem.responseData || [];
      } else {
        let resData = await getChatResData({
          appId: props.appId,
          chatId: props.chatId,
          dataId,
          ...outLinkAuthData
        });
        setChatHistories((state) =>
          state.map((item) => (item.dataId === dataId ? { ...item, responseData: resData } : item))
        );
        return resData;
      }
    },
    [chatHistories, outLinkAuthData, props.appId, props.chatId, setChatHistories]
  );
  const value: useChatStoreType = {
    ...props,
    shareId,
    outLinkUid,
    teamId,
    teamToken,
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
    chatHistories,
    setChatHistories,
    isChatting,
    chatInputGuide,
    outLinkAuthData,
    variablesForm,
    getHistoryResponseData,
    chatType
  };

  return <ChatBoxContext.Provider value={value}>{children}</ChatBoxContext.Provider>;
};

export default React.memo(Provider);
