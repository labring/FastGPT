import { type ChatSiteItemType } from '@fastgpt/global/core/chat/type';
import type { LinkedPaginationProps, LinkedListResponse } from '@fastgpt/web/common/fetch/type';
import { useLinkedScroll } from '@fastgpt/web/hooks/useLinkedScroll';
import React, { type ReactNode, useMemo, useState, useEffect } from 'react';
import { createContext } from 'use-context-selector';
import { getChatRecords } from '../api';
import { ChatStatusEnum } from '@fastgpt/global/core/chat/constants';
import { type BoxProps } from '@chakra-ui/react';
import { useMemoEnhance } from '@fastgpt/web/hooks/useMemoEnhance';
import type { GetChatRecordsProps } from '@/global/core/chat/api';
import { ChatLogsFilterEnum } from '@fastgpt/global/core/chat/correction/constants';
import { chatRequestManager } from '@/web/core/chat/utils/chatRequestManager';

type ChatRecordContextType = {
  isLoadingRecords: boolean;
  chatRecords: ChatSiteItemType[];
  setChatRecords: React.Dispatch<React.SetStateAction<ChatSiteItemType[]>>;
  isChatRecordsLoaded: boolean;
  totalRecordsCount: number;
  goodTotal?: number;
  badTotal?: number;
  notFoundTotal?: number;
  chatLogsFilter?: ChatLogsFilterEnum;
  isLoading: boolean;
  setChatLogsFilter?: (filter: ChatLogsFilterEnum) => void;
  ScrollData: ({
    children,
    ...props
  }: {
    children: React.ReactNode;
    ScrollContainerRef?: React.RefObject<HTMLDivElement>;
    dataScrollContainer?: string;
  } & BoxProps) => React.JSX.Element;
  itemRefs: React.MutableRefObject<Map<string, HTMLElement | null>>;
};

export const ChatRecordContext = createContext<ChatRecordContextType>({
  isLoadingRecords: false,
  chatRecords: [],
  setChatRecords: function (value: React.SetStateAction<ChatSiteItemType[]>): void {
    throw new Error('Function not implemented.');
  },
  isChatRecordsLoaded: false,
  goodTotal: 0,
  badTotal: 0,
  notFoundTotal: 0,
  chatLogsFilter: ChatLogsFilterEnum.all,
  setChatLogsFilter: function (filter: ChatLogsFilterEnum): void {
    throw new Error('Function not implemented.');
  },
  isLoading: false,
  ScrollData: function ({
    children,
    ...props
  }: {
    children: React.ReactNode;
    ScrollContainerRef?: React.RefObject<HTMLDivElement>;
    dataScrollContainer?: string;
  } & BoxProps): React.JSX.Element {
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
  feedbackRecordId
}: {
  children: ReactNode;
  params: GetChatRecordsProps;
  feedbackRecordId?: string;
}) => {
  const [isChatRecordsLoaded, setIsChatRecordsLoaded] = useState(false);
  const [chatLogsFilter, setChatLogsFilter] = useState<ChatLogsFilterEnum>(ChatLogsFilterEnum.all);
  const [goodTotal, setGoodTotal] = useState(0);
  const [badTotal, setBadTotal] = useState(0);
  const [notFoundTotal, setNotFoundTotal] = useState(0);
  const [lastTotalCount, setLastTotalCount] = useState(0);
  const [lastChatId, setLastChatId] = useState(params.chatId);
  const [totalRecordsCount, setTotalRecordsCount] = useState(0);

  const requestParams = useMemo(
    () => ({
      ...params,
      chatLogsFilter
    }),
    [params, chatLogsFilter]
  );

  // Reset lastTotalCount when chatId changes to ensure new chat shows correct count
  useEffect(() => {
    if (params.chatId !== lastChatId) {
      setLastTotalCount(0);
      setLastChatId(params.chatId);
    }
  }, [params.chatId, lastChatId]);

  const currentData = useMemoEnhance(() => ({ id: feedbackRecordId || '' }), [feedbackRecordId]);
  const {
    dataList: chatRecords,
    setDataList: setChatRecords,
    ScrollData,
    isLoading,
    itemRefs
  } = useLinkedScroll(
    async (
      data: LinkedPaginationProps<GetChatRecordsProps>
    ): Promise<LinkedListResponse<ChatSiteItemType>> => {
      setIsChatRecordsLoaded(false);

      // 检查是否有缓存数据（正在流式输出的会话）
      if (data.chatId) {
        const cachedRecords = chatRequestManager.getChatRecordsCache(data.chatId);
        if (cachedRecords && chatRequestManager.isStreaming(data.chatId)) {
          // 使用缓存数据，不从服务器加载
          return {
            list: cachedRecords,
            hasMorePrev: false,
            hasMoreNext: false
          };
        }
      }

      const res = await getChatRecords(data);

      // Update statistics when filter changes
      if (res.goodTotal !== undefined) setGoodTotal(res.goodTotal);
      if (res.badTotal !== undefined) setBadTotal(res.badTotal);
      if (res.notFoundTotal !== undefined) setNotFoundTotal(res.notFoundTotal);

      // Save the latest total count to avoid showing 0 during reload
      if (res.total !== undefined && res.total > 0) {
        setLastTotalCount(res.total);
      }
      setTotalRecordsCount(res.total);

      setIsChatRecordsLoaded(true);

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
      pageSize: 10,
      params: requestParams,
      currentData,
      defaultScroll: 'bottom',
      showErrorToast: false
    }
  );

  const contextValue = useMemoEnhance(() => {
    return {
      isLoadingRecords: isLoading,
      chatRecords,
      setChatRecords,
      totalRecordsCount: totalRecordsCount > 0 ? totalRecordsCount : lastTotalCount,
      goodTotal,
      badTotal,
      notFoundTotal,
      chatLogsFilter,
      setChatLogsFilter,
      ScrollData,
      isChatRecordsLoaded,
      isLoading,
      itemRefs
    };
  }, [
    isLoading,
    chatRecords,
    setChatRecords,
    totalRecordsCount,
    lastTotalCount,
    goodTotal,
    badTotal,
    notFoundTotal,
    chatLogsFilter,
    setChatLogsFilter,
    ScrollData,
    isChatRecordsLoaded,
    itemRefs
  ]);
  return <ChatRecordContext.Provider value={contextValue}>{children}</ChatRecordContext.Provider>;
};

export default ChatRecordContextProvider;
