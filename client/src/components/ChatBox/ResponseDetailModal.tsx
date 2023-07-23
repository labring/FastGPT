import React, { useCallback, useMemo, useState } from 'react';
import { ChatModuleEnum } from '@/constants/chat';
import { ChatHistoryItemResType, QuoteItemType } from '@/types/chat';
import { Flex, BoxProps } from '@chakra-ui/react';
import { updateHistoryQuote } from '@/api/chat';
import dynamic from 'next/dynamic';
import Tag from '../Tag';
import MyTooltip from '../MyTooltip';
const QuoteModal = dynamic(() => import('./QuoteModal'), { ssr: false });

const ResponseDetailModal = ({
  chatId,
  contentId,
  responseData = []
}: {
  chatId?: string;
  contentId?: string;
  responseData?: ChatHistoryItemResType[];
}) => {
  console.log(responseData);

  const [quoteModalData, setQuoteModalData] = useState<QuoteItemType[]>();

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
        <Tag colorSchema="green" cursor={'default'} {...TagStyles}>
          {completeMessages.length}条上下文
        </Tag>
      )}
      {tokens > 0 && (
        <Tag colorSchema="gray" cursor={'default'} {...TagStyles}>
          {tokens}tokens
        </Tag>
      )}
      {/* <Button
        size={'sm'}
        variant={'base'}
        borderRadius={'md'}
        fontSize={'xs'}
        px={2}
        lineHeight={1}
        py={1}
      >
        完整参数
      </Button> */}
      {!!quoteModalData && (
        <QuoteModal
          rawSearch={quoteModalData}
          onUpdateQuote={updateQuote}
          onClose={() => setQuoteModalData(undefined)}
        />
      )}
    </Flex>
  );
};

export default ResponseDetailModal;
