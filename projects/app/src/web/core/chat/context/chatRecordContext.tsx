import { type ChatSiteItemType } from '@/components/core/chat/ChatContainer/ChatBox/type';
import type { LinkedPaginationProps, LinkedListResponse } from '@fastgpt/global/openapi/api';
import { useLinkedScroll } from '@fastgpt/web/hooks/useLinkedScroll';
import React, { type ReactNode, useMemo, useState, useEffect } from 'react';
import { createContext } from 'use-context-selector';
import { getChatRecords } from '../record/api';
import { ChatStatusEnum } from '@fastgpt/global/core/chat/constants';
import { type BoxProps } from '@chakra-ui/react';
import { useMemoEnhance } from '@fastgpt/web/hooks/useMemoEnhance';
import type { GetPaginationRecordsBodyType } from '@fastgpt/global/openapi/core/chat/record/api';
import type { GetRecordsV2ResponseType } from '@fastgpt/global/openapi/core/chat/record/api';
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
  feedbackRecordId,
  fetchFn
}: {
  children: ReactNode;
  params: GetPaginationRecordsBodyType;
  feedbackRecordId?: string;
  fetchFn?: (
    data: LinkedPaginationProps<GetPaginationRecordsBodyType>
  ) => Promise<GetRecordsV2ResponseType>;
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
  const callApi = fetchFn ?? getChatRecords;
  const {
    dataList: chatRecords,
    setDataList: setChatRecords,
    ScrollData,
    isLoading,
    itemRefs
  } = useLinkedScroll(
    async (
      data: LinkedPaginationProps<GetPaginationRecordsBodyType>
    ): Promise<LinkedListResponse<ChatSiteItemType>> => {
      if (!data.appId) {
        return {
          list: [],
          hasMorePrev: false,
          hasMoreNext: false
        };
      }

      setIsChatRecordsLoaded(false);

      // 检查是否有缓存数据（正在流式输出的会话）
      if (data.chatId) {
        const cachedRecords = chatRequestManager.getChatRecordsCache(data.chatId);
        if (cachedRecords && chatRequestManager.isStreaming(data.chatId)) {
          // 使用缓存数据，不从服务器加载
          setIsChatRecordsLoaded(true);
          return {
            list: cachedRecords,
            hasMorePrev: false,
            hasMoreNext: false
          };
        }
      }

      const res = await callApi(data);

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

  // 组件在流式输出期间重新挂载时，订阅缓存更新以同步后续流式数据到当前 setChatRecords
  useEffect(() => {
    const chatId = params.chatId;
    if (!chatId || !chatRequestManager.isStreaming(chatId)) return;

    const unsubscribe = chatRequestManager.subscribe(chatId, (records) => {
      setChatRecords(records);
    });

    return unsubscribe;
  }, [params.chatId]); // eslint-disable-line react-hooks/exhaustive-deps

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
