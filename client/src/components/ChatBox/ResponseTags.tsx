import React, { useCallback, useMemo, useState } from 'react';
import { ChatModuleEnum } from '@/constants/chat';
import { ChatHistoryItemResType, ChatItemType, QuoteItemType } from '@/types/chat';
import { Flex, BoxProps, useDisclosure } from '@chakra-ui/react';
import { useTranslation } from 'react-i18next';
import { useGlobalStore } from '@/store/global';
import dynamic from 'next/dynamic';
import Tag from '../Tag';
import MyTooltip from '../MyTooltip';
const QuoteModal = dynamic(() => import('./QuoteModal'), { ssr: false });
const ContextModal = dynamic(() => import('./ContextModal'), { ssr: false });
const WholeResponseModal = dynamic(() => import('./WholeResponseModal'), { ssr: false });

const ResponseTags = ({
  chatId,
  contentId,
  responseData = []
}: {
  chatId?: string;
  contentId?: string;
  responseData?: ChatHistoryItemResType[];
}) => {
  const { isPc } = useGlobalStore();
  const { t } = useTranslation();
  const [quoteModalData, setQuoteModalData] = useState<QuoteItemType[]>();
  const [contextModalData, setContextModalData] = useState<ChatItemType[]>();
  const {
    isOpen: isOpenWholeModal,
    onOpen: onOpenWholeModal,
    onClose: onCloseWholeModal
  } = useDisclosure();

  const {
    quoteList = [],
    completeMessages = [],
    tokens = 0
  } = useMemo(() => {
    const chatData = responseData.find((item) => item.moduleName === ChatModuleEnum.AIChat);
    if (!chatData) return {};
    return {
      quoteList: chatData.quoteList,
      completeMessages: chatData.completeMessages,
      tokens: responseData.reduce((sum, item) => sum + (item.tokens || 0), 0)
    };
  }, [responseData]);

  const updateQuote = useCallback(async (quoteId: string, sourceText?: string) => {}, []);

  const TagStyles: BoxProps = {
    mr: 2,
    bg: 'transparent'
  };

  return responseData.length === 0 ? null : (
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
      {isPc && tokens > 0 && (
        <Tag colorSchema="purple" cursor={'default'} {...TagStyles}>
          {tokens}Tokens
        </Tag>
      )}
      <MyTooltip label={'点击查看完整响应值'}>
        <Tag colorSchema="gray" cursor={'pointer'} {...TagStyles} onClick={onOpenWholeModal}>
          {t('chat.Complete Response')}
        </Tag>
      </MyTooltip>

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
      {isOpenWholeModal && (
        <WholeResponseModal response={responseData} onClose={onCloseWholeModal} />
      )}
    </Flex>
  );
};

export default ResponseTags;
