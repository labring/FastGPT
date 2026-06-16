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
import { normalizeHistoryTitle, upsertHistoryTitle } from './historyTitleUtils';

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
  loadHistories: (options?: { init?: boolean; silent?: boolean }) => void;
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

  const { isOpen: isOpenSlider, onClose: onCloseSlider, onOpen: openSlider } = useDisclosure();
  const openSliderTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const onOpenSlider = useCallback(() => {
    if (openSliderTimerRef.current) {
      clearTimeout(openSliderTimerRef.current);
    }

    openSliderTimerRef.current = setTimeout(() => {
      openSlider();
      openSliderTimerRef.current = undefined;
    }, 0);
  }, [openSlider]);

  useEffect(() => {
    return () => {
      if (openSliderTimerRef.current) {
        clearTimeout(openSliderTimerRef.current);
      }
    };
  }, []);

  const {
    ScrollData,
    isLoading: isPaginationLoading,
    setData: setHistories,
    setTotal: setHistoriesTotal,
    fetchData: loadHistories,
    data: histories
  } = useScrollPagination(getChatHistories, {
    pageSize: 20,
    params,
    refreshDeps: [params],
    showErrorToast: false
  });
  const displayHistories = useMemo(() => histories.map(normalizeHistoryTitle), [histories]);
  const historiesRef = useRef(displayHistories);

  useEffect(() => {
    historiesRef.current = displayHistories;
  }, [displayHistories]);

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
        ...(historyAppId ? { appId: historyAppId } : {}),
        chatId,
        ...outLinkAuthData
      }),
    {
      onSuccess(data, params) {
        const chatId = params[0];
        const hasDeletedHistory = historiesRef.current.some((i) => i.chatId === chatId);

        setHistories((old) => old.filter((i) => i.chatId !== chatId));
        if (hasDeletedHistory) {
          setHistoriesTotal((total) => Math.max(total - 1, 0));
        }
      },
      refreshDeps: [outLinkAuthData, historyAppId]
    }
  );

  const { runAsync: onClearHistories, loading: isClearingHistory } = useRequest(
    () =>
      delClearChatHistories({
        ...(historyAppId ? { appId: historyAppId } : {}),
        ...outLinkAuthData
      }),
    {
      refreshDeps: [outLinkAuthData, historyAppId],
      onSuccess() {
        setHistories([]);
        setHistoriesTotal(0);
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
          title: newTitle
        })
      );
      loadHistories({ init: true, silent: true });
    },
    [historyAppId, loadHistories, setHistories]
  );

  const historyChatIdsKey = useMemo(
    () => displayHistories.map((h) => h.chatId).join(','),
    [displayHistories]
  );
  const prevHistoryAppIdRef = useRef<string | null>(null);
  const pendingAppChatRestoreRef = useRef(false);

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
    const scopedHistories = displayHistories.filter((item) => item.appId === historyAppId);

    if (scopedHistories.some((item) => item.chatId === currentChatId)) {
      return;
    }

    if (scopedHistories.length > 0) {
      // 跨应用恢复历史时必须重新拉 init，否则 chatBoxData 会停留在上一个应用。
      onChangeChatId(scopedHistories[0].chatId);
    }
  }, [historyAppId, displayHistories, isPaginationLoading, onChangeChatId]);

  /** 侧栏是否仍有「思考中」：仅此时需要定时轮询；无则只依赖单次 poll / 可见性拉取，避免一直打接口。 */
  const hasGeneratingInSidebar = useMemo(
    () => displayHistories.some((h) => h.chatGenerateStatus === ChatGenerateStatusEnum.generating),
    [displayHistories]
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
      histories: displayHistories,
      onUpdateHistoryTitle
    }),
    [
      ScrollData,
      displayHistories,
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
