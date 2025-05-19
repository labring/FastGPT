import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { useRouter } from 'next/router';
import React, { ReactNode, useCallback, useMemo, useRef } from 'react';
import { createContext } from 'use-context-selector';
import {
  delClearChatHistories,
  delChatHistoryById,
  putChatHistory,
  getChatHistories
} from '../api';
import { ChatHistoryItemType } from '@fastgpt/global/core/chat/type';
import { UpdateHistoryProps } from '@/global/core/chat/api';
import { BoxProps, useDisclosure } from '@chakra-ui/react';
import { useChatStore } from './useChatStore';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { useScrollPagination } from '@fastgpt/web/hooks/useScrollPagination';

type UpdateHistoryParams = {
  chatId: UpdateHistoryProps['chatId'];
  customTitle?: UpdateHistoryProps['customTitle'];
  top?: UpdateHistoryProps['top'];
};

type ChatContextValueType = {
  params: Record<string, string | number | boolean>;
};
type ChatContextType = {
  onUpdateHistory: (data: UpdateHistoryParams) => void;
  onDelHistory: (chatId: string) => Promise<undefined>;
  onClearHistories: () => Promise<undefined>;
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
};

/* 
  主要存放历史记录数据。
  同时还存放外部链接鉴权信息，不会在 chatTest 下使用
*/
export const ChatContext = createContext<ChatContextType>({
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
  onUpdateHistory: function (data: UpdateHistoryParams): void {
    throw new Error('Function not implemented.');
  },
  onDelHistory: function (data: string): Promise<undefined> {
    throw new Error('Function not implemented.');
  },
  onClearHistories: function (): Promise<undefined> {
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
  params
}: ChatContextValueType & { children: ReactNode }) => {
  const router = useRouter();

  const forbidLoadChat = useRef(false);
  const { chatId, appId, setChatId, outLinkAuthData } = useChatStore();

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
    refreshDeps: [params],
    showErrorToast: false
  });

  const onChangeChatId = useCallback(
    (changeChatId = getNanoid(24), forbid = false) => {
      if (chatId !== changeChatId) {
        forbidLoadChat.current = forbid;
        setChatId(changeChatId);
      }
      onCloseSlider();
    },
    [chatId, onCloseSlider, setChatId]
  );

  const onChangeAppId = useCallback(
    (appId: string) => {
      router.replace({
        query: {
          ...router.query,
          appId
        }
      });
      onCloseSlider();
    },
    [onCloseSlider, router]
  );

  const { runAsync: onUpdateHistory } = useRequest2(
    (data: UpdateHistoryParams) =>
      putChatHistory({
        appId,
        ...data,
        ...outLinkAuthData
      }),
    {
      onBefore(params) {
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
      refreshDeps: [outLinkAuthData, appId],
      errorToast: undefined
    }
  );

  const { runAsync: onDelHistory, loading: isDeletingHistory } = useRequest2(
    (chatId: string) =>
      delChatHistoryById({
        appId: appId,
        chatId,
        ...outLinkAuthData
      }),
    {
      onSuccess(data, params) {
        const chatId = params[0];
        setHistories((old) => old.filter((i) => i.chatId !== chatId));
      },
      refreshDeps: [outLinkAuthData, appId]
    }
  );

  const { runAsync: onClearHistories, loading: isClearingHistory } = useRequest2(
    () =>
      delClearChatHistories({
        appId: appId,
        ...outLinkAuthData
      }),
    {
      refreshDeps: [outLinkAuthData, appId],
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

  const isLoading = isDeletingHistory || isClearingHistory || isPaginationLoading;

  const contextValue = useMemo(
    () => ({
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
      onUpdateHistoryTitle
    }),
    [
      ScrollData,
      histories,
      isLoading,
      isOpenSlider,
      loadHistories,
      onChangeAppId,
      onChangeChatId,
      onClearHistories,
      onCloseSlider,
      onDelHistory,
      onOpenSlider,
      onUpdateHistory,
      onUpdateHistoryTitle,
      setHistories
    ]
  );
  return <ChatContext.Provider value={contextValue}>{children}</ChatContext.Provider>;
};

export default ChatContextProvider;
