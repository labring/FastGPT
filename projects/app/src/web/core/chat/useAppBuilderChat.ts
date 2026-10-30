import { useEffect } from 'react';
import { useMemoizedFn } from 'ahooks';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import type { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { useUserStore } from '@/web/support/user/useUserStore';
import { useChatStore } from './context/useChatStore';
import { getChatHistories } from './history/api';

/**
 * 辅助生成优先使用应用缓存；缓存为空时恢复服务端第一条会话，明确无历史才新建。
 * 登录及切换团队由 chatStore 清空缓存；迟到的历史响应不能覆盖新身份或主动新开的会话。
 */
export const useAppBuilderChat = ({
  appId,
  sourceType,
  watchChatId,
  ready = true
}: {
  appId: string;
  sourceType: ChatSourceTypeEnum.chatAgentHelper | ChatSourceTypeEnum.workflowBuilder;
  watchChatId?: string;
  ready?: boolean;
}) => {
  const tmbId = useUserStore((state) => state.userInfo?.team?.tmbId ?? '');
  const cachedChatId = useChatStore((state) => state.appBuilderChatIdMap[appId] ?? '');
  const isChatStoreLoaded = useChatStore((state) => state.loaded);
  const setAppBuilderChatId = useChatStore((state) => state.setAppBuilderChatId);
  const scopeKey = `${sourceType}:${appId}:${tmbId}`;
  const { run, cancel, loading, error, params } = useRequest(
    async ({ appId }: { appId: string; scopeKey: string }) => {
      const { list } = await getChatHistories({ appId, sourceType, pageNum: 1, pageSize: 1 });
      return list[0]?.chatId;
    },
    {
      errorToast: '',
      onSuccess: (latestChatId, [{ scopeKey: requestScopeKey }]) => {
        if (
          requestScopeKey !== scopeKey ||
          watchChatId ||
          useChatStore.getState().appBuilderChatIdMap[appId]
        ) {
          return;
        }
        setAppBuilderChatId(appId, latestChatId);
      }
    }
  );
  const restoreChat = useMemoizedFn(() => run({ appId, scopeKey }));
  const restartChat = useMemoizedFn(() => setAppBuilderChatId(appId));

  useEffect(() => {
    if (!ready || !isChatStoreLoaded || !appId || !tmbId || watchChatId || cachedChatId) return;

    restoreChat();
    return cancel;
  }, [
    appId,
    cachedChatId,
    cancel,
    isChatStoreLoaded,
    ready,
    restoreChat,
    scopeKey,
    tmbId,
    watchChatId
  ]);

  return {
    chatId: watchChatId ?? cachedChatId,
    restartChat,
    restoreChat,
    isRestoringChat: loading,
    restoreChatError: params[0]?.scopeKey === scopeKey ? error : undefined
  };
};
