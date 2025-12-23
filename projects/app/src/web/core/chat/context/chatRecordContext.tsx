import { type getPaginationRecordsBody } from '@/pages/api/core/chat/getPaginationRecords';
import { type ChatSiteItemType } from '@fastgpt/global/core/chat/type';
import { type PaginationResponse } from '@fastgpt/web/common/fetch/type';
import { useScrollPagination } from '@fastgpt/web/hooks/useScrollPagination';
import React, { type ReactNode, useMemo, useState } from 'react';
import { createContext, useContextSelector } from 'use-context-selector';
import { ChatItemContext } from './chatItemContext';
import { getChatRecords } from '../api';
import { ChatStatusEnum } from '@fastgpt/global/core/chat/constants';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { type BoxProps } from '@chakra-ui/react';
import { ChatLogsFilterEnum } from '@fastgpt/global/core/chat/correction/constants';

type ChatRecordContextType = {
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
};

export const ChatRecordContext = createContext<ChatRecordContextType>({
  chatRecords: [],
  setChatRecords: function (value: React.SetStateAction<ChatSiteItemType[]>): void {
    throw new Error('Function not implemented.');
  },
  isChatRecordsLoaded: false,
  totalRecordsCount: 0,
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
  }
});

/* 
    具体对话记录的上下文
*/
const ChatRecordContextProvider = ({
  children,
  params
}: {
  children: ReactNode;
  params: Omit<getPaginationRecordsBody, 'offset' | 'pageSize'>;
}) => {
  const ChatBoxRef = useContextSelector(ChatItemContext, (v) => v.ChatBoxRef);
  const [isChatRecordsLoaded, setIsChatRecordsLoaded] = useState(false);
  const [chatLogsFilter, setChatLogsFilter] = useState<ChatLogsFilterEnum>(ChatLogsFilterEnum.all);
  const [goodTotal, setGoodTotal] = useState(0);
  const [badTotal, setBadTotal] = useState(0);
  const [notFoundTotal, setNotFoundTotal] = useState(0);
  const [lastTotalCount, setLastTotalCount] = useState(0);

  const requestParams = useMemo(
    () => ({
      ...params,
      chatLogsFilter
    }),
    [params, chatLogsFilter]
  );

  const {
    data: chatRecords,
    ScrollData,
    setData: setChatRecords,
    total: totalRecordsCount,
    isLoading
  } = useScrollPagination(
    async (data: getPaginationRecordsBody): Promise<PaginationResponse<ChatSiteItemType>> => {
      setIsChatRecordsLoaded(false);

      const res = await getChatRecords(data);

      // Update statistics when filter changes
      if (res.goodTotal !== undefined) setGoodTotal(res.goodTotal);
      if (res.badTotal !== undefined) setBadTotal(res.badTotal);
      if (res.notFoundTotal !== undefined) setNotFoundTotal(res.notFoundTotal);

      // Save the latest total count to avoid showing 0 during reload
      if (res.total !== undefined && res.total > 0) {
        setLastTotalCount(res.total);
      }

      // First load scroll to bottom
      if (Number(data.offset) === 0) {
        function scrollToBottom() {
          requestAnimationFrame(() => {
            // Try ChatBoxRef first (for normal ChatBox)
            if (ChatBoxRef?.current?.scrollToBottom) {
              ChatBoxRef.current.scrollToBottom('auto');
            } else {
              // Fallback: try to find the scroll container and scroll to bottom
              const scrollContainer = document.querySelector(
                '[dataScrollContainer="true"]'
              ) as HTMLElement;

              if (scrollContainer) {
                scrollContainer.scrollTop = scrollContainer.scrollHeight;
              }
            }
          });
        }
        scrollToBottom();
      }

      return {
        ...res,
        list: res.list.map((item) => ({
          ...item,
          dataId: item.dataId || getNanoid(),
          status: ChatStatusEnum.finish
        }))
      };
    },
    {
      pageSize: 10,
      refreshDeps: [requestParams],
      params: requestParams,
      scrollLoadType: 'top',
      showErrorToast: false,
      onFinally() {
        setIsChatRecordsLoaded(true);
      }
    }
  );

  const contextValue = useMemo(() => {
    return {
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
      isLoading
    };
  }, [
    ScrollData,
    chatRecords,
    setChatRecords,
    totalRecordsCount,
    lastTotalCount,
    goodTotal,
    badTotal,
    notFoundTotal,
    chatLogsFilter,
    isLoading,
    setChatLogsFilter,
    isChatRecordsLoaded
  ]);
  return <ChatRecordContext.Provider value={contextValue}>{children}</ChatRecordContext.Provider>;
};

export default ChatRecordContextProvider;
