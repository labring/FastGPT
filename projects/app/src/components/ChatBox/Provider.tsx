import React, { useContext, createContext, useState, useMemo, useEffect, useCallback } from 'react';
import { useAudioPlay } from '@/web/common/utils/voice';
import { OutLinkChatAuthProps } from '@fastgpt/global/support/permission/chat';
import { ModuleItemType } from '@fastgpt/global/core/module/type';
import { splitGuideModule } from '@fastgpt/global/core/module/utils';
import {
  AppTTSConfigType,
  AppWhisperConfigType,
  VariableItemType
} from '@fastgpt/global/core/app/type';
import { ChatSiteItemType } from '@fastgpt/global/core/chat/type';

type useChatStoreType = OutLinkChatAuthProps & {
  welcomeText: string;
  variableModules: VariableItemType[];
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
  chatHistories: ChatSiteItemType[];
  setChatHistories: React.Dispatch<React.SetStateAction<ChatSiteItemType[]>>;
  isChatting: boolean;
};
const StateContext = createContext<useChatStoreType>({
  welcomeText: '',
  variableModules: [],
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
  }
});

export type ChatProviderProps = OutLinkChatAuthProps & {
  userGuideModule?: ModuleItemType;

  // not chat test params
  chatId?: string;
  children: React.ReactNode;
};

export const useChatProviderStore = () => useContext(StateContext);

const Provider = ({
  shareId,
  outLinkUid,
  teamId,
  teamToken,
  userGuideModule,
  children
}: ChatProviderProps) => {
  const [chatHistories, setChatHistories] = useState<ChatSiteItemType[]>([]);

  const { welcomeText, variableModules, questionGuide, ttsConfig, whisperConfig } = useMemo(
    () => splitGuideModule(userGuideModule),
    [userGuideModule]
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
    shareId,
    outLinkUid,
    teamId,
    teamToken
  });

  const autoTTSResponse =
    whisperConfig?.open && whisperConfig?.autoSend && whisperConfig?.autoTTSResponse && hasAudio;

  const isChatting = useMemo(
    () =>
      chatHistories[chatHistories.length - 1] &&
      chatHistories[chatHistories.length - 1]?.status !== 'finish',
    [chatHistories]
  );

  const value: useChatStoreType = {
    shareId,
    outLinkUid,
    teamId,
    teamToken,
    welcomeText,
    variableModules,
    questionGuide,
    ttsConfig,
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
    isChatting
  };

  return <StateContext.Provider value={value}>{children}</StateContext.Provider>;
};

export default React.memo(Provider);
