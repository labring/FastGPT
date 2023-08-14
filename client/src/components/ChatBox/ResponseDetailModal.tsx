import React, { useCallback, useMemo, useState } from 'react';
import { ChatModuleEnum } from '@/constants/chat';
import { ChatHistoryItemResType, ChatItemType, QuoteItemType } from '@/types/chat';
import { Flex, BoxProps } from '@chakra-ui/react';
import dynamic from 'next/dynamic';
import Tag from '../Tag';
import MyTooltip from '../MyTooltip';
const QuoteModal = dynamic(() => import('./QuoteModal'), { ssr: false });
const ContextModal = dynamic(() => import('./ContextModal'), { ssr: false });

const ResponseDetailModal = ({
  chatId,
  contentId,
  responseData = []
}: {
  chatId?: string;
  contentId?: string;
  responseData?: ChatHistoryItemResType[];
}) => {
  const [quoteModalData, setQuoteModalData] = useState<QuoteItemType[]>();
  const [contextModalData, setContextModalData] = useState<ChatItemType[]>();

  const {
    tokens = 0,
    quoteList = [],
    completeMessages = []
  } = useMemo(() => {
    const chatData = responseData.find((item) => item.moduleName === ChatModuleEnum.AIChat);
    if (!chatData) return {};
    return {
      tokens: chatData.tokens,
      quoteList: chatData.quoteList,
      completeMessages: chatData.completeMessages
    };
  }, [responseData]);

  const isEmpty = useMemo(
    () => quoteList.length === 0 && completeMessages.length === 0 && tokens === 0,
    [completeMessages.length, quoteList.length, tokens]
  );

  const updateQuote = useCallback(async (quoteId: string, sourceText: string) => {}, []);

  const TagStyles: BoxProps = {
    mr: 2,
    bg: 'transparent'
  };

  return isEmpty ? null : (
    <Flex alignItems={'center'} mt={2} flexWrap={'wrap'}>
      {quoteList.length > 0 && (
        <MyTooltip label="查看引用">
          <Tag
            colorSchema="blue"
            cursor={'pointer'}
            {...TagStyles}
            onClick={() => setQuoteModalData(quoteList)}
          >
            {quoteList.length}条引用
          </Tag>
        </MyTooltip>
      )}
      {completeMessages.length > 0 && (
        <MyTooltip label={'点击查看完整对话记录'}>
          <Tag
            colorSchema="green"
            cursor={'pointer'}
            {...TagStyles}
            onClick={() => setContextModalData(completeMessages)}
          >
            {completeMessages.length}条上下文
          </Tag>
        </MyTooltip>
      )}
      {tokens > 0 && (
        <Tag colorSchema="gray" cursor={'default'} {...TagStyles}>
          {tokens}tokens
        </Tag>
      )}
      {!!quoteModalData && (
        <QuoteModal
          rawSearch={quoteModalData}
          onUpdateQuote={updateQuote}
          onClose={() => setQuoteModalData(undefined)}
        />
      )}
      {!!contextModalData && (
        <ContextModal context={contextModalData} onClose={() => setContextModalData(undefined)} />
      )}
    </Flex>
  );
};

export default ResponseDetailModal;
