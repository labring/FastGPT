import { type ChatSiteItemType } from '@/components/core/chat/ChatContainer/ChatBox/type';
import type { LinkedPaginationProps, LinkedListResponse } from '@fastgpt/global/openapi/api';
import {
  useLinkedScroll,
  type LinkedScrollDataProps,
  type LinkedScrollPaginationLoading
} from '@fastgpt/web/hooks/useLinkedScroll';
import React, { type ReactNode, useState } from 'react';
import { createContext } from 'use-context-selector';
import { getChatRecords } from '../record/api';
import { ChatStatusEnum } from '@fastgpt/global/core/chat/constants';
import { useMemoEnhance } from '@fastgpt/web/hooks/useMemoEnhance';
import type { GetRecordsV2ResponseType } from '@fastgpt/global/openapi/core/chat/record/api';
import { hasChatAuthTargetInput, type ChatAuthTargetInput } from '../utils';
import { useMemoizedFn } from 'ahooks';

type ChatRecordProviderParams = ChatAuthTargetInput & {
  chatId?: string;
  pageSize?: number | string;
} & Record<string, unknown>;

type ChatRecordContextType = {
  isLoadingRecords: boolean;
  isInitialLoadingRecords: boolean;
  paginationLoading: LinkedScrollPaginationLoading;
  chatRecords: ChatSiteItemType[];
  setChatRecords: React.Dispatch<React.SetStateAction<ChatSiteItemType[]>>;
  refreshChatRecords: () => Promise<ChatSiteItemType[]>;
  truncateChatRecords: (dataId: string) => Promise<ChatSiteItemType[]>;
  isChatRecordsLoaded: boolean;
  totalRecordsCount: number;
  ScrollData: (props: LinkedScrollDataProps) => React.JSX.Element;
  itemRefs: React.MutableRefObject<Map<string, HTMLElement | null>>;
};

export const ChatRecordContext = createContext<ChatRecordContextType>({
  isLoadingRecords: false,
  isInitialLoadingRecords: false,
  paginationLoading: { prev: false, next: false },
  chatRecords: [],
  setChatRecords: function (_value: React.SetStateAction<ChatSiteItemType[]>): void {
    throw new Error('Function not implemented.');
  },
  refreshChatRecords: async () => [],
  truncateChatRecords: async () => [],
  isChatRecordsLoaded: false,

  ScrollData: function (_props: LinkedScrollDataProps): React.JSX.Element {
    throw new Error('Function not implemented.');
  },
  totalRecordsCount: 0,
  itemRefs: { current: new Map() }
});

/*
  具体对话记录的上下文
*/
const ChatRecordContextProvider = ({
  children,
  params,
  feedbackRecordId,
  fetchFn,
  showPrevLoading = true
}: {
  children: ReactNode;
  params: ChatRecordProviderParams;
  feedbackRecordId?: string;
  fetchFn?: (
    data: LinkedPaginationProps<ChatRecordProviderParams>
  ) => Promise<GetRecordsV2ResponseType>;
  showPrevLoading?: boolean;
}) => {
  const [isChatRecordsLoaded, setIsChatRecordsLoaded] = useState(false);
  const [totalRecordsCount, setTotalRecordsCount] = useState(0);

  const currentData = useMemoEnhance(() => ({ id: feedbackRecordId || '' }), [feedbackRecordId]);
  const {
    dataList: chatRecords,
    setDataList: setChatRecords,
    replaceDataList,
    hasMorePrev,
    hasMoreNext,
    ScrollData,
    isLoading,
    isInitialLoading,
    paginationLoading,
    itemRefs,
    loadInitData
  } = useLinkedScroll(
    async (
      data: LinkedPaginationProps<ChatRecordProviderParams>
    ): Promise<LinkedListResponse<ChatSiteItemType>> => {
      const request = (() => {
        if (fetchFn) return () => fetchFn(data);
        if (hasChatAuthTargetInput(data)) return () => getChatRecords(data);
        return undefined;
      })();
      if (!request) {
        return {
          list: [],
          hasMorePrev: false,
          hasMoreNext: false
        };
      }

      setIsChatRecordsLoaded(false);

      const res = await request().finally(() => {
        setIsChatRecordsLoaded(true);
      });
      setTotalRecordsCount(res.total);

      return {
        list: res.list.map((item) => ({
          ...item,
          dataId: item.dataId!,
          status: ChatStatusEnum.finish
        })),
        hasMorePrev: res.hasMorePrev,
        hasMoreNext: res.hasMoreNext
      };
    },
    {
      pageSize: 20,
      params,
      currentData,
      defaultScroll: 'bottom',
      showErrorToast: false,
      showPrevLoading
    }
  );

  /** 重新加载最新记录窗口，并同步 useLinkedScroll 内部的分页锚点。 */
  const refreshChatRecords = useMemoizedFn(async () => {
    const response = await loadInitData({ refresh: true, scrollWhenFinish: false });
    return response?.list ?? [];
  });

  /**
   * 服务端删除成功后裁掉目标及后续记录，同时同步分页游标。
   * 当前窗口被删空且前面还有历史时，需要补回前文（包括 Ask/Preview）；非末尾窗口沿用刷新。
   */
  const truncateChatRecords = useMemoizedFn(async (dataId: string) => {
    const index = chatRecords.findIndex((item) => item.dataId === dataId);
    if (index < 0) throw new Error('Chat record not found');
    if (hasMoreNext || (index === 0 && hasMorePrev)) return refreshChatRecords();

    const history = chatRecords.slice(0, index);
    replaceDataList({ list: history, hasMorePrev, hasMoreNext: false });
    return history;
  });

  const contextValue = useMemoEnhance(() => {
    return {
      isLoadingRecords: isLoading,
      isInitialLoadingRecords: isInitialLoading,
      paginationLoading,
      chatRecords,
      setChatRecords,
      refreshChatRecords,
      truncateChatRecords,
      ScrollData,
      isChatRecordsLoaded,
      totalRecordsCount,
      itemRefs
    };
  }, [
    isLoading,
    isInitialLoading,
    paginationLoading,
    chatRecords,
    setChatRecords,
    refreshChatRecords,
    truncateChatRecords,
    totalRecordsCount,
    ScrollData,
    isChatRecordsLoaded
  ]);
  return <ChatRecordContext.Provider value={contextValue}>{children}</ChatRecordContext.Provider>;
};

export default ChatRecordContextProvider;
