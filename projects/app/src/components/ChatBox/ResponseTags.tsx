import React, { useMemo, useState } from 'react';
import type { ChatHistoryItemResType } from '@fastgpt/global/core/chat/api.d';
import type { ChatItemType } from '@fastgpt/global/core/chat/type';
import { Flex, BoxProps, useDisclosure, Image, useTheme } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import type { SearchDataResponseItemType } from '@fastgpt/global/core/dataset/type';
import dynamic from 'next/dynamic';
import Tag from '../Tag';
import MyTooltip from '../MyTooltip';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/module/node/constant';
import { getSourceNameIcon } from '@fastgpt/global/core/dataset/utils';
import ChatBoxDivider from '@/components/core/chat/Divider';

const QuoteModal = dynamic(() => import('./QuoteModal'), { ssr: false });
const ContextModal = dynamic(() => import('./ContextModal'), { ssr: false });
const WholeResponseModal = dynamic(() => import('./WholeResponseModal'), { ssr: false });

const ResponseTags = ({ responseData = [] }: { responseData?: ChatHistoryItemResType[] }) => {
  const theme = useTheme();
  const { isPc } = useSystemStore();
  const { t } = useTranslation();
  const [quoteModalData, setQuoteModalData] = useState<SearchDataResponseItemType[]>();
  const [contextModalData, setContextModalData] = useState<ChatItemType[]>();
  const {
    isOpen: isOpenWholeModal,
    onOpen: onOpenWholeModal,
    onClose: onCloseWholeModal
  } = useDisclosure();

  const {
    chatAccount,
    quoteList = [],
    sourceList = [],
    historyPreview = [],
    runningTime = 0
  } = useMemo(() => {
    const chatData = responseData.find((item) => item.moduleType === FlowNodeTypeEnum.chatNode);
    const quoteList = responseData
      .filter((item) => item.moduleType === FlowNodeTypeEnum.chatNode)
      .map((item) => item.quoteList)
      .flat()
      .filter(Boolean) as SearchDataResponseItemType[];
    const sourceList = quoteList.reduce(
      (acc: Record<string, SearchDataResponseItemType[]>, cur) => {
        if (!acc[cur.sourceName]) {
          acc[cur.sourceName] = [cur];
        }
        return acc;
      },
      {}
    );

    return {
      chatAccount: responseData.filter((item) => item.moduleType === FlowNodeTypeEnum.chatNode)
        .length,
      quoteList,
      sourceList: Object.values(sourceList)
        .flat()
        .map((item) => ({
          sourceName: item.sourceName,
          icon: getSourceNameIcon({ sourceId: item.sourceId, sourceName: item.sourceName })
        })),
      historyPreview: chatData?.historyPreview,
      runningTime: +responseData.reduce((sum, item) => sum + (item.runningTime || 0), 0).toFixed(2)
    };
  }, [responseData]);

  const TagStyles: BoxProps = {
    mr: 2,
    bg: 'transparent'
  };

  return responseData.length === 0 ? null : (
    <>
      {sourceList.length > 0 && (
        <>
          <ChatBoxDivider icon="core/chat/quoteFill" text={t('chat.Quote')} />
          <Flex alignItems={'center'} flexWrap={'wrap'} gap={2}>
            {sourceList.map((item) => (
              <Flex
                key={item.sourceName}
                alignItems={'center'}
                flexWrap={'wrap'}
                fontSize={'sm'}
                cursor={'pointer'}
                border={theme.borders.sm}
                py={1}
                px={2}
                borderRadius={'md'}
                _hover={{
                  bg: 'myBlue.100'
                }}
                onClick={() => setQuoteModalData(quoteList)}
              >
                <Image src={item.icon} alt={''} mr={1} w={'12px'} />
                {item.sourceName}
              </Flex>
            ))}
          </Flex>
        </>
      )}
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
        {chatAccount === 1 && (
          <>
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
          <QuoteModal rawSearch={quoteModalData} onClose={() => setQuoteModalData(undefined)} />
        )}
        {!!contextModalData && (
          <ContextModal context={contextModalData} onClose={() => setContextModalData(undefined)} />
        )}
        {isOpenWholeModal && (
          <WholeResponseModal response={responseData} onClose={onCloseWholeModal} />
        )}
      </Flex>
    </>
  );
};

export default React.memo(ResponseTags);
