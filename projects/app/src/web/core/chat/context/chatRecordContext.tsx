import { type ChatSiteItemType } from '@/components/core/chat/ChatContainer/ChatBox/type';
import type { LinkedPaginationProps, LinkedListResponse } from '@fastgpt/global/openapi/api';
import { useLinkedScroll } from '@fastgpt/web/hooks/useLinkedScroll';
import React, { type ReactNode, useState } from 'react';
import { createContext } from 'use-context-selector';
import { getChatRecords } from '../record/api';
import { ChatStatusEnum } from '@fastgpt/global/core/chat/constants';
import { type BoxProps } from '@chakra-ui/react';
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
  chatRecords: ChatSiteItemType[];
  setChatRecords: React.Dispatch<React.SetStateAction<ChatSiteItemType[]>>;
  refreshChatRecords: () => Promise<ChatSiteItemType[]>;
  isChatRecordsLoaded: boolean;
  totalRecordsCount: number;
  ScrollData: ({
    children,
    ...props
  }: {
    children: React.ReactNode;
    ScrollContainerRef?: React.RefObject<HTMLDivElement>;
  } & BoxProps) => React.JSX.Element;
  itemRefs: React.MutableRefObject<Map<string, HTMLElement | null>>;
};

export const ChatRecordContext = createContext<ChatRecordContextType>({
  isLoadingRecords: false,
  chatRecords: [],
  setChatRecords: function (_value: React.SetStateAction<ChatSiteItemType[]>): void {
    throw new Error('Function not implemented.');
  },
  refreshChatRecords: async () => [],
  isChatRecordsLoaded: false,

  ScrollData: function (
    _props: {
      children: React.ReactNode;
      ScrollContainerRef?: React.RefObject<HTMLDivElement>;
    } & BoxProps
  ): React.JSX.Element {
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
  params: ChatRecordProviderParams;
  feedbackRecordId?: string;
  fetchFn?: (
    data: LinkedPaginationProps<ChatRecordProviderParams>
  ) => Promise<GetRecordsV2ResponseType>;
}) => {
  const [isChatRecordsLoaded, setIsChatRecordsLoaded] = useState(false);
  const [totalRecordsCount, setTotalRecordsCount] = useState(0);

  const currentData = useMemoEnhance(() => ({ id: feedbackRecordId || '' }), [feedbackRecordId]);
  const callApi = fetchFn ?? getChatRecords;
  const {
    dataList: chatRecords,
    setDataList: setChatRecords,
    ScrollData,
    isLoading,
    itemRefs,
    loadInitData
  } = useLinkedScroll(
    async (
      data: LinkedPaginationProps<ChatRecordProviderParams>
    ): Promise<LinkedListResponse<ChatSiteItemType>> => {
      if (!fetchFn && !hasChatAuthTargetInput(data)) {
        return {
          list: [],
          hasMorePrev: false,
          hasMoreNext: false
        };
      }

      setIsChatRecordsLoaded(false);

      const res = await callApi(data).finally(() => {
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
      pageSize: 10,
      params,
      currentData,
      defaultScroll: 'bottom',
      showErrorToast: false
    }
  );

  /** 重新加载最新记录窗口，并同步 useLinkedScroll 内部的分页锚点。 */
  const refreshChatRecords = useMemoizedFn(async () => {
    const response = await loadInitData({ refresh: true, scrollWhenFinish: false });
    return response?.list ?? [];
  });

  const contextValue = useMemoEnhance(() => {
    return {
      isLoadingRecords: isLoading,
      chatRecords,
      setChatRecords,
      refreshChatRecords,
      ScrollData,
      isChatRecordsLoaded,
      totalRecordsCount,
      itemRefs
    };
  }, [
    isLoading,
    chatRecords,
    setChatRecords,
    refreshChatRecords,
    totalRecordsCount,
    ScrollData,
    isChatRecordsLoaded
  ]);
  return <ChatRecordContext.Provider value={contextValue}>{children}</ChatRecordContext.Provider>;
};

export default ChatRecordContextProvider;
