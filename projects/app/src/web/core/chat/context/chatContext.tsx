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
import { useDisclosure } from '@chakra-ui/react';
import { useChatStore } from './useChatStore';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { useScrollPagination, type ScrollListType } from '@fastgpt/web/hooks/useScrollPagination';
import type {
  GetHistoriesBodyType,
  UpdateHistoryBodyType
} from '@fastgpt/global/openapi/core/chat/history/api';
import { ChatGenerateStatusEnum, ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { normalizeHistoryTitle, upsertHistoryTitle } from './historyTitleUtils';
import { toChatAuthApiTarget, type ChatSourceTarget } from '../utils';
import { useUserStore } from '@/web/support/user/useUserStore';
import { clearChatInputDrafts, removeChatInputDraft } from '../inputDraft/storage';

type UpdateHistoryParams = Pick<UpdateHistoryBodyType, 'chatId' | 'customTitle' | 'top'>;

type ChatContextValueType = {
  params: GetHistoriesBodyType;
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
  ScrollData: ScrollListType;
  onChangeAppId: (appId: string) => void;
  isLoading: boolean;
  isInitialLoading: boolean;
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
  isLoading: false,
  isInitialLoading: false
});

const ChatContextProvider = ({
  children,
  params,
  disabled = false
}: ChatContextValueType & { children: ReactNode; disabled?: boolean }) => {
  const router = useRouter();

  const forbidLoadChat = useRef(false);
  const { chatId, setChatId, outLinkAuthData } = useChatStore();
  const historyAppId = typeof params.appId === 'string' ? params.appId : '';
  const tmbId = useUserStore((state) => state.userInfo?.team?.tmbId);
  const historySkillId = typeof params.skillId === 'string' ? params.skillId : '';
  const historyOutLinkAuthData = useMemo(() => {
    const paramsOutLinkAuthData =
      params.outLinkAuthData && typeof params.outLinkAuthData === 'object'
        ? params.outLinkAuthData
        : undefined;

    return paramsOutLinkAuthData ?? outLinkAuthData;
  }, [outLinkAuthData, params.outLinkAuthData]);
  const historySourceTarget = useMemo<ChatSourceTarget>(
    () =>
      historySkillId
        ? {
            sourceType: ChatSourceTypeEnum.skillEdit,
            sourceId: historySkillId
          }
        : {
            sourceType: params.sourceType ?? ChatSourceTypeEnum.app,
            sourceId: historyAppId
          },
    [historyAppId, historySkillId, params.sourceType]
  );
  const historyTargetParams = useMemo(
    () =>
      toChatAuthApiTarget({
        sourceTarget: historySourceTarget,
        outLinkAuthData: historyOutLinkAuthData
      }),
    [historyOutLinkAuthData, historySourceTarget]
  );

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
    isInitialLoading,
    setData: setHistories,
    setTotal: setHistoriesTotal,
    fetchData: loadHistories,
    data: histories
  } = useScrollPagination(getChatHistories, {
    pageSize: 20,
    params,
    // /chat without an appId is the app-picker entry. It still needs this
    // context for the picker UI, but must not query history with an empty ID.
    disabled,
    refreshDeps: [params],
    showErrorToast: false,
    showNoMoreTip: false
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
        ...historyTargetParams,
        ...data
      }),
    {
      onBefore(params) {
        const { chatId, top, customTitle } = params[0];

        setHistories((histories) => {
          const updatedHistories = histories.map((history) => {
            if (history.chatId === chatId) {
              return {
                ...history,
                customTitle: customTitle !== undefined ? customTitle : history.customTitle,
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
      refreshDeps: [historyTargetParams],
      errorToast: undefined
    }
  );

  const { runAsync: onDelHistory, loading: isDeletingHistory } = useRequest(
    async (chatId: string) => {
      // 删除请求完成时可能已切换成员或应用，草稿必须清理发起请求时的身份。
      const identity = tmbId && historyAppId ? { tmbId, appId: historyAppId, chatId } : undefined;
      const result = await delChatHistoryById({
        ...historyTargetParams,
        chatId
      });
      if (identity) removeChatInputDraft({ identity });
      return result;
    },
    {
      onSuccess(data, params) {
        const chatId = params[0];
        const hasDeletedHistory = historiesRef.current.some((i) => i.chatId === chatId);

        setHistories((old) => old.filter((i) => i.chatId !== chatId));
        if (hasDeletedHistory) {
          setHistoriesTotal((total) => Math.max(total - 1, 0));
        }
      },
      refreshDeps: [historyTargetParams]
    }
  );

  const { runAsync: onClearHistories, loading: isClearingHistory } = useRequest(
    async () => {
      const scope = tmbId && historyAppId ? { tmbId, appId: historyAppId } : undefined;
      const result = await delClearChatHistories({
        ...historyTargetParams
      });
      if (scope) clearChatInputDrafts(scope);
      return result;
    },
    {
      refreshDeps: [historyTargetParams],
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

  /** 列表存在运行中会话时持续轮询；全部空闲且没有失败重试时只做单次刷新。 */
  const hasGeneratingInSidebar = useMemo(
    () => displayHistories.some((h) => h.chatGenerateStatus === ChatGenerateStatusEnum.generating),
    [displayHistories]
  );
  const statusPollingNeedsRetry = useRef(false);

  useEffect(() => {
    statusPollingNeedsRetry.current = false;
  }, [historyTargetParams]);

  // 轮询同步侧栏 chatGenerateStatus / hasBeenRead（以服务端为准）。
  // 运行中或上一轮请求失败时继续重试；成功确认全部空闲后停止，切回标签页仍单次刷新。
  useEffect(() => {
    if (disabled || (!historyAppId && !historySkillId) || !historiesRef.current.length) return;

    let polling = false;
    let disposed = false;
    let timer: number | undefined;

    /** 请求失败保留原状态并继续重试；初始空闲列表的首次请求失败也要能启动定时器。 */
    const syncPollingTimer = () => {
      if (disposed) return;
      if (hasGeneratingInSidebar || statusPollingNeedsRetry.current) {
        timer ??= window.setInterval(() => {
          if (document.visibilityState === 'visible') poll();
        }, 5000);
      } else if (timer !== undefined) {
        window.clearInterval(timer);
        timer = undefined;
      }
    };

    const poll = async () => {
      // 分批读取未结束时不叠加下一轮；切换资源后忽略旧请求返回的状态。
      if (polling || disposed) return;
      polling = true;
      try {
        const chatIds = historiesRef.current.map((h) => h.chatId);
        const res = await getChatHistoryStatus({ ...historyTargetParams, chatIds });
        if (disposed) return;
        statusPollingNeedsRetry.current = false;
        const map = new Map(res.list.map((item) => [item.chatId, item]));
        setHistories((prev) =>
          prev.map((item) => {
            const status = map.get(item.chatId);
            if (!status) return item;
            const nextGen = status.chatGenerateStatus ?? item.chatGenerateStatus;
            return {
              ...item,
              chatGenerateStatus: nextGen,
              hasBeenRead:
                nextGen === ChatGenerateStatusEnum.generating
                  ? false
                  : (status.hasBeenRead ?? item.hasBeenRead),
              updateTime: status.updateTime ?? item.updateTime
            };
          })
        );
      } catch {
        if (disposed) return;
        // 请求失败无法确认最新状态，静默保留整轮快照，等待下一次成功读取后再更新。
        statusPollingNeedsRetry.current = true;
      } finally {
        polling = false;
        syncPollingTimer();
      }
    };

    poll();

    const onVisibility = () => {
      if (document.visibilityState === 'visible') poll();
    };
    document.addEventListener('visibilitychange', onVisibility);

    syncPollingTimer();

    return () => {
      disposed = true;
      if (timer !== undefined) window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [
    disabled,
    historyAppId,
    historySkillId,
    historyTargetParams,
    historyChatIdsKey,
    hasGeneratingInSidebar,
    setHistories
  ]);

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
      isInitialLoading,
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
      isInitialLoading,
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
