import { Box, type BoxProps, Card, Flex } from '@chakra-ui/react';
import React, { useMemo } from 'react';
import ChatItemController, { type ChatItemControllerProps } from './ChatItemController';
import { MessageCardStyle } from '../../constants';
import { formatChatValue2InputType } from '../../utils';
import Markdown from '@/components/Markdown';
import styles from '../../index.module.scss';
import {
  ChatItemValueTypeEnum,
  ChatRoleEnum,
  ChatStatusEnum
} from '@fastgpt/global/core/chat/constants';
import FilesBlock from '../FilesBox';
import { ChatBoxContext } from '../../Provider';
import { useContextSelector } from 'use-context-selector';
import AIResponseBox from '../../../../components/AIResponseBox';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useTranslation } from 'next-i18next';
import {
  type AIChatItemValueItemType,
  type ChatItemValueItemType
} from '@fastgpt/global/core/chat/type';
import { isEqual } from 'lodash';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import { ChatItemContext } from '@/web/core/chat/context/chatItemContext';
import { addStatisticalDataToHistoryItem } from '@/global/core/chat/utils';
import ChatBoxDivider from '../../../../Divider';
import { getSourceNameIcon } from '@fastgpt/global/core/dataset/utils';
import type { ChatSiteItemType } from '@fastgpt/global/core/chat/type';
import { isCorrectionRecord } from '@/global/core/chat/utils';

const colorMap = {
  [ChatStatusEnum.loading]: {
    bg: 'myGray.100',
    color: 'myGray.600'
  },
  [ChatStatusEnum.running]: {
    bg: 'green.50',
    color: 'green.700'
  },
  [ChatStatusEnum.finish]: {
    bg: 'green.50',
    color: 'green.700'
  }
};

type BasicProps = {
  statusBoxData?: {
    status: `${ChatStatusEnum}`;
    name: string;
  };
  questionGuides?: string[];
  children?: React.ReactNode;
} & Omit<ChatItemControllerProps, 'onCorrectError'> & {
    onCorrectError?: (dataId: string, defaultCorrectionData?: any) => void;
  };

type Props = BasicProps & {
  type: ChatRoleEnum.Human | ChatRoleEnum.AI;
};

// 轻量级引用展示组件
const SimpleCitationDisplay = React.memo(
  function SimpleCitationDisplay({ historyItem }: { historyItem: ChatSiteItemType }) {
    const { t } = useTranslation();
    const { totalQuoteList: quoteList = [], toolCiteLinks = [] } = useMemo(
      () => addStatisticalDataToHistoryItem(historyItem),
      [historyItem]
    );

    // 合并数据集引用和链接引用
    const citationList = useMemo(() => {
      // 数据集引用
      const datasetItems = Object.values(
        quoteList.reduce((acc: Record<string, any[]>, cur) => {
          if (!acc[cur.collectionId]) {
            acc[cur.collectionId] = [cur];
          }
          return acc;
        }, {})
      )
        .flat()
        .map((item, index) => ({
          id: item.collectionId,
          displayText: item.sourceName,
          icon: item.imageId
            ? 'core/dataset/imageFill'
            : getSourceNameIcon({ sourceId: item.sourceId, sourceName: item.sourceName }),
          index: index + 1
        }));

      // 链接引用
      const linkItems = toolCiteLinks.map((r, index) => ({
        id: `${r.url}-${index}`,
        displayText: r.name,
        icon: 'common/link',
        index: datasetItems.length + index + 1
      }));

      return [...datasetItems, ...linkItems].filter((v) => !isCorrectionRecord(v.id));
    }, [quoteList, toolCiteLinks]);

    if (citationList.length === 0) return null;

    return (
      <>
        <Flex
          py={2}
          px={3}
          mt={3}
          bg={'rgba(245, 249, 255, 0.6)'}
          w={'100%'}
          borderRadius={'4px'}
          position={'relative'}
        >
          <Box mr={2.5}>
            <MyIcon mt={1} name="core/chat/quoteFill" w={'14px'} color={'#C9CBFFCC'} />
          </Box>
          <Box>
            <Box lineHeight={6} height={6} fontSize={'xs'} color="#333333" fontWeight={500} mb={1}>
              {t('app:chat_item_citation_source')} {citationList.length}
            </Box>
            <Box pb={1} borderRadius={'md'} fontSize={'xs'} color={'myGray.500'}>
              {citationList.map((item) => (
                <Box key={item.id} _notLast={{ mb: 1 }} height={'16px'}>
                  {item.index}.{item.displayText}
                </Box>
              ))}
            </Box>
          </Box>
          <Box
            position={'absolute'}
            right={'20px'}
            top={'50%'}
            transform={'translateY(-50%)'}
            h={'calc(100% - 40px)'}
          >
            <MyIcon name="core/chat/quoteBg" h={'100%'} />
          </Box>
        </Flex>
      </>
    );
  },
  (prevProps, nextProps) => prevProps.historyItem.dataId === nextProps.historyItem.dataId
);

const HumanContentCard = React.memo(
  function HumanContentCard({ chatValue }: { chatValue: ChatItemValueItemType[] }) {
    const { text, files = [] } = formatChatValue2InputType(chatValue);
    return (
      <Flex flexDirection={'column'} gap={4} color={'white'}>
        {files.length > 0 && <FilesBlock files={files} />}
        {text && <Markdown source={text} />}
      </Flex>
    );
  },
  (prevProps, nextProps) => isEqual(prevProps.chatValue, nextProps.chatValue)
);
const AIContentCard = React.memo(function AIContentCard({
  chatValue,
  dataId,
  isLastChild,
  isChatting
}: {
  dataId: string;
  chatValue: ChatItemValueItemType[];
  isLastChild: boolean;
  isChatting: boolean;
}) {
  return (
    <Flex flexDirection={'column'} gap={2}>
      {chatValue.map((value, i) => {
        const key = `${dataId}-ai-${i}`;

        return (
          <AIResponseBox
            chatItemDataId={dataId}
            key={key}
            value={value}
            isLastResponseValue={isLastChild && i === chatValue.length - 1}
            isChatting={isChatting}
            hideCiteIcon={true}
          />
        );
      })}
    </Flex>
  );
});

const ChatItem = (props: Props) => {
  const { type, statusBoxData, children, isLastChild, chat, onCorrectError } = props;

  const styleMap: BoxProps = {
    ...(type === ChatRoleEnum.Human
      ? {
          order: 0,
          borderRadius: '8px',
          justifyContent: 'flex-start',
          textAlign: 'left',
          bg: 'primary.600',
          color: '#fffff'
        }
      : {
          order: 1,
          borderRadius: '0 8px 8px 8px',
          justifyContent: 'flex-start',
          textAlign: 'left',
          padding: 0
        }),
    fontSize: 'mini',
    fontWeight: '400',
    color: 'myGray.500'
  };
  const { t } = useTranslation();

  const isChatting = useContextSelector(ChatBoxContext, (v) => v.isChatting);
  const showNodeStatus = useContextSelector(ChatItemContext, (v) => v.showNodeStatus);

  const chatStatusMap = useMemo(() => {
    if (!statusBoxData?.status) return;
    return colorMap[statusBoxData.status];
  }, [statusBoxData?.status]);

  /* 
    1. The interactive node is divided into n dialog boxes.
    2. Auto-complete the last textnode
  */
  const splitAiResponseResults = useMemo(() => {
    if (chat.obj !== ChatRoleEnum.AI) return [chat.value];

    // Remove empty text node
    const filterList = chat.value.filter((item, i) => {
      if (item.type === ChatItemValueTypeEnum.text && !item.text?.content?.trim()) {
        return false;
      }
      return item;
    });

    const groupedValues: AIChatItemValueItemType[][] = [];
    let currentGroup: AIChatItemValueItemType[] = [];

    filterList.forEach((value) => {
      if (value.type === 'interactive') {
        if (currentGroup.length > 0) {
          groupedValues.push(currentGroup);
          currentGroup = [];
        }

        groupedValues.push([value]);
      } else {
        currentGroup.push(value);
      }
    });

    if (currentGroup.length > 0) {
      groupedValues.push(currentGroup);
    }

    // Check last group is interactive, Auto add a empty text node(animation)
    const lastGroup = groupedValues[groupedValues.length - 1];
    if (isChatting || groupedValues.length === 0) {
      if (
        (lastGroup &&
          lastGroup[lastGroup.length - 1] &&
          lastGroup[lastGroup.length - 1].type === ChatItemValueTypeEnum.interactive) ||
        groupedValues.length === 0
      ) {
        groupedValues.push([
          {
            type: ChatItemValueTypeEnum.text,
            text: {
              content: ''
            }
          }
        ]);
      }
    }

    return groupedValues;
  }, [chat.obj, chat.value, isChatting]);

  const cardStyle = useMemo(
    () =>
      type === ChatRoleEnum.AI
        ? {
            ...MessageCardStyle,
            px: 0,
            py: 0,
            w: '100%'
          }
        : { ...MessageCardStyle, w: 'fit-content' },
    [type]
  );

  return (
    <Box
      _hover={{
        '& .time-label': {
          display: 'block'
        }
      }}
    >
      {/* control icon */}
      <Flex w={'100%'} alignItems={'center'} gap={2} justifyContent={styleMap.justifyContent}>
        {isChatting && type === ChatRoleEnum.AI && isLastChild ? null : (
          <Flex w={'100%'} order={styleMap.order} ml={styleMap.ml} align={'center'} gap={'0.62rem'}>
            <ChatItemController
              chat={chat}
              isLastChild={isLastChild}
              onCorrectError={onCorrectError ? () => onCorrectError(chat.dataId) : undefined}
            />
          </Flex>
        )}

        {/* Workflow status */}
        {!!chatStatusMap && statusBoxData && isLastChild && showNodeStatus && (
          <Flex
            alignItems={'center'}
            px={3}
            py={'1.5px'}
            borderRadius="md"
            bg={chatStatusMap.bg}
            fontSize={'sm'}
          >
            <Box
              className={styles.statusAnimation}
              bg={chatStatusMap.color}
              w="8px"
              h="8px"
              borderRadius={'50%'}
              mt={'1px'}
            />
            <Box ml={2} color={'myGray.600'}>
              {statusBoxData.name}
            </Box>
          </Flex>
        )}
      </Flex>
      {/* content */}
      {splitAiResponseResults.map((value, i) => (
        <Box
          key={i}
          mt={['6px', 2]}
          className="chat-box-card"
          textAlign={styleMap.textAlign}
          _hover={{
            '& .footer-copy': {
              display: 'block'
            }
          }}
        >
          <Card
            {...cardStyle}
            bg={styleMap.bg}
            borderRadius={styleMap.borderRadius}
            textAlign={'left'}
            maxW={'100%'}
          >
            {type === ChatRoleEnum.Human && (
              <>
                <HumanContentCard chatValue={value} />
              </>
            )}
            {type === ChatRoleEnum.AI && (
              <>
                <AIContentCard
                  chatValue={value}
                  dataId={chat.dataId}
                  isLastChild={isLastChild && i === splitAiResponseResults.length - 1}
                  isChatting={isChatting}
                />
                <SimpleCitationDisplay historyItem={chat} />
                <Box color="#CCCCCC" mt={2} fontSize={'0.85rem'}>
                  {t('app:chat_item_cost_time')} {chat.durationSeconds}s
                </Box>
              </>
            )}
            {/* Example: Response tags. A set of dialogs only needs to be displayed once*/}
            {i === splitAiResponseResults.length - 1 && (
              <>
                {/* error message */}
                {!!chat.errorMsg && (
                  <Box mt={2}>
                    <ChatBoxDivider icon={'common/errorFill'} text={t('chat:error_message')} />
                    <Box fontSize={'xs'} color={'myGray.500'}>
                      {chat.errorMsg}
                    </Box>
                  </Box>
                )}
                {children}
              </>
            )}
          </Card>
          {type === ChatRoleEnum.Human &&
            chat.rewriteStandardizedQuery &&
            formatChatValue2InputType(chat.value).text !== chat.rewriteStandardizedQuery && (
              <Box
                color="myGray.500"
                fontSize={'0.8rem'}
                mt={2}
                bg={'primary.50'}
                p={[2, 3]}
                w={'fit-content'}
                maxW={'100%'}
                borderRadius={'0px 8px 8px 8px'}
              >
                {t('app:chat_item_rewrite')}：{chat.rewriteStandardizedQuery}
              </Box>
            )}
        </Box>
      ))}
    </Box>
  );
};

export default React.memo(ChatItem);
