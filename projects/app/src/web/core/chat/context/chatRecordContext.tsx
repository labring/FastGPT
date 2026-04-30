import { type ChatSiteItemType } from '@/components/core/chat/ChatContainer/ChatBox/type';
import type { LinkedPaginationProps, LinkedListResponse } from '@fastgpt/global/openapi/api';
import { useLinkedScroll } from '@fastgpt/web/hooks/useLinkedScroll';
import React, { type ReactNode, useState } from 'react';
import { createContext } from 'use-context-selector';
import { getChatRecords } from '../record/api';
import { ChatStatusEnum } from '@fastgpt/global/core/chat/constants';
import { type BoxProps } from '@chakra-ui/react';
import { useMemoEnhance } from '@fastgpt/web/hooks/useMemoEnhance';
import type { GetPaginationRecordsBodyType } from '@fastgpt/global/openapi/core/chat/record/api';
import type { GetRecordsV2ResponseType } from '@fastgpt/global/openapi/core/chat/record/api';

type ChatRecordContextType = {
  isLoadingRecords: boolean;
  chatRecords: ChatSiteItemType[];
  setChatRecords: React.Dispatch<React.SetStateAction<ChatSiteItemType[]>>;
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
  setChatRecords: function (value: React.SetStateAction<ChatSiteItemType[]>): void {
    throw new Error('Function not implemented.');
  },
  isChatRecordsLoaded: false,

  ScrollData: function ({
    children,
    ...props
  }: {
    children: React.ReactNode;
    ScrollContainerRef?: React.RefObject<HTMLDivElement>;
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
  const [totalRecordsCount, setTotalRecordsCount] = useState(0);

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

  const contextValue = useMemoEnhance(() => {
    return {
      isLoadingRecords: isLoading,
      chatRecords,
      setChatRecords,
      ScrollData,
      isChatRecordsLoaded,
      totalRecordsCount,
      itemRefs
    };
  }, [isLoading, chatRecords, setChatRecords, totalRecordsCount, ScrollData, isChatRecordsLoaded]);
  return <ChatRecordContext.Provider value={contextValue}>{children}</ChatRecordContext.Provider>;
};

export default ChatRecordContextProvider;
