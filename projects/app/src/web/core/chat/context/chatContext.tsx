import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { useRouter } from 'next/router';
import React, { type ReactNode, useCallback, useEffect, useMemo, useRef } from 'react';
import { createContext } from 'use-context-selector';
import {
  delClearChatHistories,
  delChatHistoryById,
  putChatHistory,
  getChatHistories,
  getChatHistoryStatus
} from '../history/api';
import { type ChatHistoryItemType } from '@fastgpt/global/core/chat/type';
import { type BoxProps, useDisclosure } from '@chakra-ui/react';
import { useChatStore } from './useChatStore';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { useScrollPagination } from '@fastgpt/web/hooks/useScrollPagination';
import type { UpdateHistoryBodyType } from '@fastgpt/global/openapi/core/chat/history/api';
import { ChatGenerateStatusEnum } from '@fastgpt/global/core/chat/constants';
import { upsertHistoryTitle } from './historyTitleUtils';

type UpdateHistoryParams = Pick<UpdateHistoryBodyType, 'chatId' | 'customTitle' | 'top'>;

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
/** 无 Provider 时（如应用编排「调试」页）侧栏历史不存在，用空实现避免抛错 */
const chatContextFallbackScrollData: ChatContextType['ScrollData'] = ({ children }) => (
  <>{children}</>
);

export const ChatContext = createContext<ChatContextType>({
  histories: [],
  onUpdateHistoryTitle: () => {},
  ScrollData: chatContextFallbackScrollData,
  loadHistories: () => {},
  setHistories: () => {},
  onUpdateHistory: () => {},
  onDelHistory: async () => undefined,
  onClearHistories: async () => undefined,
  isOpenSlider: false,
  onCloseSlider: () => {},
  onOpenSlider: () => {},
  forbidLoadChat: { current: false },
  onChangeChatId: () => {},
  onChangeAppId: () => {},
  isLoading: false
});

const ChatContextProvider = ({
  children,
  params
}: ChatContextValueType & { children: ReactNode }) => {
  const router = useRouter();

  const forbidLoadChat = useRef(false);
  const { chatId, setChatId, outLinkAuthData } = useChatStore();
  const historyAppId = String(params.appId ?? '');

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
      setHistories((state) =>
        state.map((item) =>
          item.chatId === changeChatId
            ? {
                ...item,
                hasBeenRead:
                  item.chatGenerateStatus === ChatGenerateStatusEnum.generating ? false : true
              }
            : item
        )
      );

      if (chatId !== changeChatId) {
        forbidLoadChat.current = forbid;
        setChatId(changeChatId);
      }
      onCloseSlider();
    },
    [chatId, onCloseSlider, setChatId, setHistories]
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

  const { runAsync: onUpdateHistory } = useRequest(
    (data: UpdateHistoryParams) =>
      putChatHistory({
        appId: historyAppId,
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
      refreshDeps: [outLinkAuthData, historyAppId],
      errorToast: undefined
    }
  );

  const { runAsync: onDelHistory, loading: isDeletingHistory } = useRequest(
    (chatId: string) =>
      delChatHistoryById({
        appId: historyAppId,
        chatId,
        ...outLinkAuthData
      }),
    {
      onSuccess(data, params) {
        const chatId = params[0];
        setHistories((old) => old.filter((i) => i.chatId !== chatId));
      },
      refreshDeps: [outLinkAuthData, historyAppId]
    }
  );

  const { runAsync: onClearHistories, loading: isClearingHistory } = useRequest(
    () =>
      delClearChatHistories({
        appId: historyAppId,
        ...outLinkAuthData
      }),
    {
      refreshDeps: [outLinkAuthData, historyAppId],
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
      const { appId: currentAppId, chatId: currentChatId } = useChatStore.getState();
      if (currentAppId !== historyAppId || chatId !== currentChatId) return;

      setHistories((state) =>
        upsertHistoryTitle({
          histories: state,
          appId: historyAppId,
          chatId,
          title: newTitle,
          fallbackTitle: '新对话'
        })
      );
      loadHistories({ init: true });
    },
    [historyAppId, loadHistories, setHistories]
  );

  const historyChatIdsKey = useMemo(() => histories.map((h) => h.chatId).join(','), [histories]);
  const historiesRef = useRef(histories);
  const prevHistoryAppIdRef = useRef<string | null>(null);
  const pendingAppChatRestoreRef = useRef(false);

  useEffect(() => {
    historiesRef.current = histories;
  }, [histories]);

  /** 切换应用后，若当前 chatId 无效则恢复该应用上次会话或最近一条历史 */
  useEffect(() => {
    if (prevHistoryAppIdRef.current === null) {
      prevHistoryAppIdRef.current = historyAppId;
      return;
    }
    if (prevHistoryAppIdRef.current !== historyAppId) {
      pendingAppChatRestoreRef.current = true;
      prevHistoryAppIdRef.current = historyAppId;
    }
  }, [historyAppId]);

  useEffect(() => {
    if (!pendingAppChatRestoreRef.current || isPaginationLoading || !historyAppId) return;

    pendingAppChatRestoreRef.current = false;

    const { chatId: currentChatId } = useChatStore.getState();
    const scopedHistories = histories.filter((item) => item.appId === historyAppId);

    if (scopedHistories.some((item) => item.chatId === currentChatId)) {
      return;
    }

    if (scopedHistories.length > 0) {
      onChangeChatId(scopedHistories[0].chatId, true);
    }
  }, [historyAppId, histories, isPaginationLoading, onChangeChatId]);

  /** 侧栏是否仍有「思考中」：仅此时需要定时轮询；无则只依赖单次 poll / 可见性拉取，避免一直打接口。 */
  const hasGeneratingInSidebar = useMemo(
    () => histories.some((h) => h.chatGenerateStatus === ChatGenerateStatusEnum.generating),
    [histories]
  );

  // 轮询同步侧栏 chatGenerateStatus / hasBeenRead（以服务端为准）。
  // 条件轮询：仅当列表里至少有一条 generating 时挂 interval；否则每次依赖变化仍会先 poll 一次，且切回标签页会再拉一次。
  useEffect(() => {
    if (!historiesRef.current.length) return;

    const poll = () => {
      const chatIds = historiesRef.current.map((h) => h.chatId);
      getChatHistoryStatus({
        ...(historyAppId ? { appId: historyAppId } : {}),
        chatIds,
        ...outLinkAuthData
      })
        .then((res) => {
          const map = new Map(res.list.map((i) => [i.chatId, i]));
          setHistories((prev) =>
            prev.map((item) => {
              const s = map.get(item.chatId);
              if (!s) return item;
              const nextGen = s.chatGenerateStatus ?? item.chatGenerateStatus;
              const nextRead =
                nextGen === ChatGenerateStatusEnum.generating
                  ? false
                  : (s.hasBeenRead ?? item.hasBeenRead);
              return {
                ...item,
                chatGenerateStatus: nextGen,
                hasBeenRead: nextRead,
                updateTime: s.updateTime ?? item.updateTime
              };
            })
          );
        })
        .catch(() => {});
    };

    poll();

    const onVisibility = () => {
      if (document.visibilityState === 'visible') poll();
    };
    document.addEventListener('visibilitychange', onVisibility);

    if (!hasGeneratingInSidebar) {
      return () => {
        document.removeEventListener('visibilitychange', onVisibility);
      };
    }

    const tick = () => {
      if (document.visibilityState === 'visible') {
        poll();
      }
    };
    const timer = window.setInterval(tick, 4000);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [historyAppId, historyChatIdsKey, hasGeneratingInSidebar, outLinkAuthData, setHistories]);

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
