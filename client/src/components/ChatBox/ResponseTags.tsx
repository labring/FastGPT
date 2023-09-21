import React, { useCallback, useMemo, useState } from 'react';
import { ChatHistoryItemResType, ChatItemType, QuoteItemType } from '@/types/chat';
import { Flex, BoxProps, useDisclosure } from '@chakra-ui/react';
import { useTranslation } from 'react-i18next';
import { useGlobalStore } from '@/store/global';
import dynamic from 'next/dynamic';
import Tag from '../Tag';
import MyTooltip from '../MyTooltip';
import { FlowModuleTypeEnum } from '@/constants/flow';

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
    chatAccount,
    quoteList = [],
    historyPreview = [],
    runningTime = 0
  } = useMemo(() => {
    const chatData = responseData.find((item) => item.moduleType === FlowModuleTypeEnum.chatNode);
    return {
      chatAccount: responseData.filter((item) => item.moduleType === FlowModuleTypeEnum.chatNode)
        .length,
      quoteList: chatData?.quoteList,
      historyPreview: chatData?.historyPreview,
      runningTime: responseData.reduce((sum, item) => sum + (item.runningTime || 0), 0).toFixed(2)
    };
  }, [responseData]);

  const updateQuote = useCallback(async (quoteId: string, sourceText?: string) => {}, []);

  const TagStyles: BoxProps = {
    mr: 2,
    bg: 'transparent'
  };

  return responseData.length === 0 ? null : (
    <Flex alignItems={'center'} mt={2} flexWrap={'wrap'}>
      {chatAccount === 1 && (
        <>
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
          {historyPreview.length > 0 && (
            <MyTooltip label={'点击查看完整对话记录'}>
              <Tag
                colorSchema="green"
                cursor={'pointer'}
                {...TagStyles}
                onClick={() => setContextModalData(historyPreview)}
              >
                {historyPreview.length}条上下文
              </Tag>
            </MyTooltip>
          )}
        </>
      )}
      {chatAccount > 1 && (
        <Tag colorSchema="blue" {...TagStyles}>
          多组 AI 对话
        </Tag>
      )}

      {isPc && runningTime > 0 && (
        <MyTooltip label={'模块运行时间和'}>
          <Tag colorSchema="purple" cursor={'default'} {...TagStyles}>
            {runningTime}s
          </Tag>
        </MyTooltip>
      )}
      <MyTooltip label={'点击查看完整响应'}>
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
