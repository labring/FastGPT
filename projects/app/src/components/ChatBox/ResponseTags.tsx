import React, { useMemo, useState } from 'react';
import type { ChatHistoryItemResType } from '@fastgpt/global/core/chat/api.d';
import type { ChatItemType } from '@fastgpt/global/core/chat/type';
import { Flex, BoxProps, useDisclosure, Image, useTheme, Box } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import type { SearchDataResponseItemType } from '@fastgpt/global/core/dataset/type';
import dynamic from 'next/dynamic';
import Tag from '../Tag';
import MyTooltip from '../MyTooltip';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/module/node/constant';
import { getSourceNameIcon } from '@fastgpt/global/core/dataset/utils';
import ChatBoxDivider from '@/components/core/chat/Divider';
import MyIcon from '../Icon';
import { getFileAndOpen } from '@/web/core/dataset/utils';

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
          sourceId: item.sourceId,
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
                border={theme.borders.sm}
                py={1}
                px={2}
                borderRadius={'md'}
                _hover={{
                  '.controller': {
                    display: 'flex'
                  }
                }}
                overflow={'hidden'}
                position={'relative'}
                onClick={() => setQuoteModalData(quoteList)}
              >
                <Image src={item.icon} alt={''} mr={1} w={'12px'} />
                <Box className="textEllipsis" flex={'1 0 0'}>
                  {item.sourceName}
                </Box>

                <Box
                  className="controller"
                  display={['flex', 'none']}
                  pr={2}
                  position={'absolute'}
                  right={0}
                  left={0}
                  justifyContent={'flex-end'}
                  alignItems={'center'}
                  h={'100%'}
                  lineHeight={0}
                  bg={`linear-gradient(to left, white,white ${
                    item.sourceId ? '60px' : '30px'
                  }, rgba(255,255,255,0) 80%)`}
                >
                  <MyTooltip label={t('core.chat.quote.Read Quote')}>
                    <MyIcon
                      name="common/viewLight"
                      w={'14px'}
                      cursor={'pointer'}
                      _hover={{
                        color: 'green.600'
                      }}
                    />
                  </MyTooltip>
                  {item.sourceId && (
                    <MyTooltip label={t('core.chat.quote.Read Source')}>
                      <MyIcon
                        ml={4}
                        name="common/routePushLight"
                        w={'14px'}
                        cursor={'pointer'}
                        _hover={{ color: 'myBlue.600' }}
                        onClick={async (e) => {
                          e.stopPropagation();

                          if (!item.sourceId) return;
                          await getFileAndOpen(item.sourceId);
                        }}
                      />
                    </MyTooltip>
                  )}
                </Box>
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
