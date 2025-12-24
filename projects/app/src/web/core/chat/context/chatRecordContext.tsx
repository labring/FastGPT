import { type ChatSiteItemType } from '@fastgpt/global/core/chat/type';
import type { LinkedPaginationProps, LinkedListResponse } from '@fastgpt/web/common/fetch/type';
import { useLinkedScroll } from '@fastgpt/web/hooks/useLinkedScroll';
import React, { type ReactNode, useState } from 'react';
import { createContext } from 'use-context-selector';
import { getChatRecords } from '../api';
import { ChatStatusEnum } from '@fastgpt/global/core/chat/constants';
import { type BoxProps } from '@chakra-ui/react';
import { useMemoEnhance } from '@fastgpt/web/hooks/useMemoEnhance';
import type { GetChatRecordsProps } from '@/global/core/chat/api';

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
  feedbackRecordId
}: {
  children: ReactNode;
  params: GetChatRecordsProps;
  feedbackRecordId?: string;
}) => {
  const [isChatRecordsLoaded, setIsChatRecordsLoaded] = useState(false);
  const [totalRecordsCount, setTotalRecordsCount] = useState(0);

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

      const res = await getChatRecords(data).finally(() => {
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
