import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { useRouter } from 'next/router';
import React, { ReactNode, useCallback, useEffect, useRef } from 'react';
import { createContext } from 'use-context-selector';
import { delClearChatHistories, delChatHistoryById, putChatHistory } from '../api';
import { ChatHistoryItemType } from '@fastgpt/global/core/chat/type';
import { ClearHistoriesProps, DelHistoryProps, UpdateHistoryProps } from '@/global/core/chat/api';
import { useDisclosure } from '@chakra-ui/react';
import { useChatStore } from './storeChat';

type ChatContextValueType = {
  histories: ChatHistoryItemType[];
  loadHistories: () => Promise<ChatHistoryItemType[]>;
};
type ChatContextType = ChatContextValueType & {
  chatId: string;
  onUpdateHistory: (data: UpdateHistoryProps) => void;
  onDelHistory: (data: DelHistoryProps) => Promise<undefined>;
  onClearHistories: (data: ClearHistoriesProps) => Promise<undefined>;
  isOpenSlider: boolean;
  onCloseSlider: () => void;
  onOpenSlider: () => void;
  forbidLoadChat: React.MutableRefObject<boolean>;
  onChangeChatId: (chatId?: string, forbid?: boolean) => void;
  onChangeAppId: (appId: string) => void;
  isLoading: boolean;
};

export const ChatContext = createContext<ChatContextType>({
  chatId: '',
  // forbidLoadChat: undefined,
  histories: [],
  loadHistories: function (): Promise<ChatHistoryItemType[]> {
    throw new Error('Function not implemented.');
  },
  onUpdateHistory: function (data: UpdateHistoryProps): void {
    throw new Error('Function not implemented.');
  },
  onDelHistory: function (data: DelHistoryProps): Promise<undefined> {
    throw new Error('Function not implemented.');
  },
  onClearHistories: function (data: ClearHistoriesProps): Promise<undefined> {
    throw new Error('Function not implemented.');
  },
  isOpenSlider: false,
  onCloseSlider: function (): void {
    throw new Error('Function not implemented.');
  },
  onOpenSlider: function (): void {
    throw new Error('Function not implemented.');
  },
  forbidLoadChat: { current: false },
  onChangeChatId: function (chatId?: string | undefined, forbid?: boolean | undefined): void {
    throw new Error('Function not implemented.');
  },
  onChangeAppId: function (appId: string): void {
    throw new Error('Function not implemented.');
  },
  isLoading: false
});

const ChatContextProvider = ({
  children,
  histories,
  loadHistories
}: ChatContextValueType & { children: ReactNode }) => {
  const router = useRouter();
  const { chatId = '' } = router.query as { chatId: string };
  const isSystemChat = router.pathname === '/chat';

  const forbidLoadChat = useRef(false);

  const { isOpen: isOpenSlider, onClose: onCloseSlider, onOpen: onOpenSlider } = useDisclosure();

  const { setLastChatId } = useChatStore();
  const onChangeChatId = useCallback(
    (changeChatId = '', forbid = false) => {
      if (chatId !== changeChatId) {
        forbidLoadChat.current = forbid;
        setLastChatId(changeChatId);
        router.replace({
          query: {
            ...router.query,
            chatId: changeChatId || ''
          }
        });
      }
      onCloseSlider();
    },
    [chatId, onCloseSlider, router, setLastChatId]
  );
  useEffect(() => {
    setLastChatId(chatId);
  }, [chatId, setLastChatId]);

  const onChangeAppId = useCallback(
    (appId: string) => {
      router.replace({
        query: {
          ...router.query,
          chatId: '',
          appId
        }
      });
      onCloseSlider();
    },
    [onCloseSlider, router]
  );

  const { runAsync: onUpdateHistory, loading: isUpdatingHistory } = useRequest2(putChatHistory, {
    onSuccess() {
      loadHistories();
    }
  });
  const { runAsync: onDelHistory, loading: isDeletingHistory } = useRequest2(delChatHistoryById, {
    onSuccess() {
      loadHistories();
    }
  });
  const { runAsync: onClearHistories, loading: isClearingHistory } = useRequest2(
    delClearChatHistories,
    {
      onSuccess() {
        loadHistories();
      },
      onFinally() {
        onChangeChatId('');
      }
    }
  );
  const isLoading = isUpdatingHistory || isDeletingHistory || isClearingHistory;

  const contextValue = {
    chatId,
    histories,
    loadHistories,
    onUpdateHistory,
    onDelHistory,
    onClearHistories,
    isOpenSlider,
    onCloseSlider,
    onOpenSlider,
    forbidLoadChat,
    onChangeChatId,
    onChangeAppId,
    isLoading
  };
  return <ChatContext.Provider value={contextValue}>{children}</ChatContext.Provider>;
};

export default ChatContextProvider;
