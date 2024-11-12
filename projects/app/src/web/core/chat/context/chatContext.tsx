import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { useRouter } from 'next/router';
import React, { ReactNode, useCallback, useEffect, useRef } from 'react';
import { createContext } from 'use-context-selector';
import {
  delClearChatHistories,
  delChatHistoryById,
  putChatHistory,
  getChatHistories
} from '../api';
import { ChatHistoryItemType } from '@fastgpt/global/core/chat/type';
import { ClearHistoriesProps, DelHistoryProps, UpdateHistoryProps } from '@/global/core/chat/api';
import { BoxProps, useDisclosure } from '@chakra-ui/react';
import { useChatStore } from './storeChat';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { useScrollPagination } from '@fastgpt/web/hooks/useScrollPagination';

type ChatContextValueType = {
  params: Record<string, string | number | boolean>;
};
type ChatContextType = {
  chatId: string;
  onUpdateHistory: (data: UpdateHistoryProps) => void;
  onDelHistory: (data: DelHistoryProps) => Promise<undefined>;
  onClearHistories: (data: ClearHistoriesProps) => Promise<undefined>;
  isOpenSlider: boolean;
  onCloseSlider: () => void;
  onOpenSlider: () => void;
  setHistories: React.Dispatch<React.SetStateAction<ChatHistoryItemType[]>>;
  forbidLoadChat: React.MutableRefObject<boolean>;
  onChangeChatId: (chatId?: string, forbid?: boolean) => void;
  loadHistories: () => void;
  ScrollData: ({
    children,
    EmptyChildren,
    isLoading,
    ...props
  }: {
    children: React.ReactNode;
    EmptyChildren?: React.ReactNode;
    isLoading?: boolean;
  } & BoxProps) => ReactNode;
  onChangeAppId: (appId: string) => void;
  isLoading: boolean;
  histories: ChatHistoryItemType[];
  onUpdateHistoryTitle: ({ chatId, newTitle }: { chatId: string; newTitle: string }) => void;
  showCompleteQuote: boolean;
};

export const ChatContext = createContext<ChatContextType>({
  chatId: '',
  // forbidLoadChat: undefined,
  histories: [],
  onUpdateHistoryTitle: function (): void {
    throw new Error('Function not implemented.');
  },
  ScrollData: function (): ReactNode {
    throw new Error('Function not implemented.');
  },
  loadHistories: function (): void {
    throw new Error('Function not implemented.');
  },
  setHistories: function (): void {
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
  isLoading: false,
  showCompleteQuote: true
});

const ChatContextProvider = ({
  children,
  params
}: ChatContextValueType & { children: ReactNode }) => {
  const router = useRouter();
  const { chatId = '' } = router.query as { chatId: string };
  const { showCompleteQuote }: { showCompleteQuote?: boolean } = params;

  const forbidLoadChat = useRef(false);

  const { isOpen: isOpenSlider, onClose: onCloseSlider, onOpen: onOpenSlider } = useDisclosure();

  const {
    ScrollData,
    isLoading: isPaginationLoading,
    setData: setHistories,
    fetchData: loadHistories,
    data: histories
  } = useScrollPagination(getChatHistories, {
    pageSize: 20,
    params,
    refreshDeps: [params]
  });

  const { setLastChatId } = useChatStore();
  const onChangeChatId = useCallback(
    (changeChatId = getNanoid(), forbid = false) => {
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

  // Refresh lastChatId
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
    onSuccess(data, params) {
      const { chatId, top, customTitle } = params[0];

      setHistories((histories) => {
        const updatedHistories = histories.map((history) => {
          if (history.chatId === chatId) {
            return {
              ...history,
              customTitle: customTitle || history.customTitle,
              top: top !== undefined ? top : history.top
            };
          }
          return history;
        });

        return top !== undefined
          ? updatedHistories.sort((a, b) => (b.top ? 1 : 0) - (a.top ? 1 : 0))
          : updatedHistories;
      });
    },
    errorToast: undefined
  });

  const { runAsync: onDelHistory, loading: isDeletingHistory } = useRequest2(delChatHistoryById, {
    onSuccess(data, params) {
      const { chatId } = params[0];
      setHistories((old) => old.filter((i) => i.chatId !== chatId));
    }
  });

  const { runAsync: onClearHistories, loading: isClearingHistory } = useRequest2(
    delClearChatHistories,
    {
      onSuccess() {
        setHistories([]);
      },
      onFinally() {
        onChangeChatId();
      }
    }
  );

  const onUpdateHistoryTitle = useCallback(
    ({ chatId, newTitle }: { chatId: string; newTitle: string }) => {
      // Chat history exists
      if (histories.find((item) => item.chatId === chatId)) {
        setHistories((state) =>
          state.map((item) => (item.chatId === chatId ? { ...item, title: newTitle } : item))
        );
      } else {
        // Chat history not exists
        loadHistories(true);
      }
    },
    [histories, loadHistories, setHistories]
  );

  const isLoading =
    isUpdatingHistory || isDeletingHistory || isClearingHistory || isPaginationLoading;

  const contextValue = {
    chatId,
    onUpdateHistory,
    onDelHistory,
    onClearHistories,
    isOpenSlider,
    onCloseSlider,
    onOpenSlider,
    forbidLoadChat,
    onChangeChatId,
    onChangeAppId,
    isLoading,
    setHistories,
    ScrollData,
    loadHistories,
    histories,
    onUpdateHistoryTitle,
    showCompleteQuote: showCompleteQuote ?? true
  };
  return <ChatContext.Provider value={contextValue}>{children}</ChatContext.Provider>;
};

export default ChatContextProvider;
