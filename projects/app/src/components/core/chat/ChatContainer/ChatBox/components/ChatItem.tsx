import { getUserChatSelect } from '@fastgpt/global/core/chat/input/utils';
import { Box, type BoxProps, Flex } from '@chakra-ui/react';
import React, { useMemo } from 'react';
import { type ChatControllerProps } from './ChatController';
import styles from '../index.module.scss';
import { ChatRoleEnum, ChatStatusEnum } from '@fastgpt/global/core/chat/constants';
import { ChatBoxContext } from '../Provider';
import { useContextSelector } from 'use-context-selector';
import { WorkflowRuntimeContext } from '../../context/workflowRuntimeContext';
import { useTranslation } from 'next-i18next';
import type { SearchDataResponseQuoteListItemType } from '@fastgpt/global/core/dataset/type';
import {
  ChatItemContext,
  type OnOpenCiteModalProps
} from '@/web/core/chat/context/chatItemContext';
import { addStatisticalDataToHistoryItem } from '@/global/core/chat/utils';
import { useMemoizedFn } from 'ahooks';
import { useMemoEnhance } from '@fastgpt/web/hooks/useMemoEnhance';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import HumanChatBubble from './HumanChatBubble';
import InteractiveReply from './InteractiveReply';
import AIChatBubble from './AIChatBubble';
import type { ChatBoxInputType } from '../type';
import { shouldFilterAiValue } from './AIChatBubble/utils';
import { getAIChatDisplayGroups } from '../utils/agentAsk';
import ChatErrorCard from './ChatErrorCard';
import { shouldShowChatItemInlineError } from '../utils/error';
import { toChatAuthApiTarget } from '@/web/core/chat/utils';
import { ChatBoxContentMaxWidth } from '../constants';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';

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

type Props = {
  statusBoxData?: {
    status: `${ChatStatusEnum}`;
    name: string;
  };
  questionGuides?: string[];
  enableSandbox?: boolean;
  onEditSubmit?: (input: ChatBoxInputType) => void | Promise<void>;
  children?: React.ReactNode;
} & ChatControllerProps;

const ChatItem = (props: Props) => {
  const {
    statusBoxData,
    children,
    isLastChild,
    questionGuides = [],
    enableSandbox = true,
    chat,
    onEditSubmit
  } = props;

  const { t } = useTranslation();

  const styleMap: BoxProps = useMemoEnhance(
    () => ({
      order: chat.obj === ChatRoleEnum.Human ? 0 : 1,
      justifyContent: chat.obj === ChatRoleEnum.Human ? 'flex-end' : 'flex-start',
      textAlign: chat.obj === ChatRoleEnum.Human ? 'right' : 'left',
      fontSize: 'mini',
      fontWeight: '400',
      color: 'myGray.500'
    }),
    [chat.obj]
  );

  const isChatting = useContextSelector(ChatBoxContext, (v) => v.isChatting);
  const boxBodyProps = useContextSelector(ChatBoxContext, (v) => v.boxBodyProps);
  const chatType = useContextSelector(ChatBoxContext, (v) => v.chatType);
  const showRunningStatus = useContextSelector(ChatItemContext, (v) => v.showRunningStatus);
  const isHumanMessage = chat.obj === ChatRoleEnum.Human;
  const { isPc } = useSystem();

  const sourceTarget = useContextSelector(WorkflowRuntimeContext, (v) => v.sourceTarget);
  const chatId = useContextSelector(WorkflowRuntimeContext, (v) => v.chatId);
  const outLinkAuthData = useContextSelector(WorkflowRuntimeContext, (v) => v.outLinkAuthData);
  const chatAuthTarget = useMemoEnhance(
    () => toChatAuthApiTarget({ sourceTarget, outLinkAuthData }),
    [sourceTarget, outLinkAuthData]
  );
  const isShowFullText = useContextSelector(ChatItemContext, (v) => v.isShowFullText);

  const statisticalChatItem = useMemoEnhance(() => addStatisticalDataToHistoryItem(chat), [chat]);
  const quoteList: SearchDataResponseQuoteListItemType[] = statisticalChatItem.totalQuoteList ?? [];
  const allowedCitationIds = useMemoEnhance(() => {
    const sourceQuoteList = statisticalChatItem.totalQuoteList;
    if (!sourceQuoteList) return;

    return new Set(sourceQuoteList.map((item) => item.id).filter((id): id is string => !!id));
  }, [statisticalChatItem.totalQuoteList]);
  const { errorText } = statisticalChatItem;
  const inlineErrorInfo = useMemo(() => {
    if (!chat.errorMsg && !errorText) return;

    const moduleName = errorText?.moduleName || chat.moduleName;
    const errorPrefix = t('chat:log.error.error_prefix');

    return {
      title: moduleName ? `${errorPrefix} - ${t(moduleName)}` : errorPrefix,
      message: t(errorText?.errorText || chat.errorMsg || 'Unknow error')
    };
  }, [chat.errorMsg, chat.moduleName, errorText, t]);
  const showInlineError = shouldShowChatItemInlineError({
    hasInlineError: !!inlineErrorInfo,
    isChatting,
    isLastChild
  });

  const isChatLog = chatType === 'log';

  const chatStatusMap = useMemoEnhance(() => {
    if (!statusBoxData?.status) return;
    return colorMap[statusBoxData.status];
  }, [statusBoxData?.status]);

  const hasFooterContent = showInlineError || React.Children.toArray(children).length > 0;
  const displayGroups = useMemo(() => {
    if (chat.obj === ChatRoleEnum.Human) return [{ type: 'human' as const, values: chat.value }];

    if (chat.obj === ChatRoleEnum.AI) {
      const groups = getAIChatDisplayGroups({
        chatValue: chat.value,
        isLastChild,
        isChatting
      });
      // 仅有提问交互时，也要保留 AI 的错误和反馈位置。
      if (hasFooterContent && groups.length === 0) {
        groups.push({ type: 'ai', values: [] });
      }
      return groups;
    }

    return [];
  }, [chat.obj, chat.value, hasFooterContent, isChatting, isLastChild]);
  const lastAiGroupIndex = displayGroups.findLastIndex((group) => group.type === 'ai');
  const hasValidAiContent = useMemo(() => {
    if (chat.obj !== ChatRoleEnum.AI) return false;

    return chat.value.some((item) => !shouldFilterAiValue(item));
  }, [chat.obj, chat.value]);

  const setCiteModalData = useContextSelector(ChatItemContext, (v) => v.setCiteModalData);
  const onOpenCiteModal = useMemoizedFn((item?: OnOpenCiteModalProps) => {
    const selectedQuote = item?.quoteId
      ? quoteList.find((quote) => quote.id === item.quoteId)
      : undefined;
    const isSingleQuote = item?.singleQuote === true && !!selectedQuote;

    // 引用已经不在当前消息的 quoteList 时，不能打开空的单条阅读器。
    if (item?.singleQuote && !isSingleQuote) return;

    const collectionId = item?.collectionId ?? selectedQuote?.collectionId;
    const rawSearch = isSingleQuote && selectedQuote ? [selectedQuote] : quoteList;
    const collectionIdList = collectionId
      ? [collectionId]
      : [...new Set(quoteList.map((quote) => quote.collectionId))];

    setCiteModalData({
      rawSearch,
      singleQuote: isSingleQuote,
      metadata:
        collectionId && isShowFullText
          ? {
              ...chatAuthTarget,
              chatId,
              chatItemDataId: chat.dataId,
              collectionId,
              collectionIdList,
              sourceId: item?.sourceId ?? selectedQuote?.sourceId ?? '',
              sourceName: item?.sourceName ?? selectedQuote?.sourceName ?? '',
              datasetId: item?.datasetId ?? selectedQuote?.datasetId ?? '',
              quoteId: item?.quoteId
            }
          : {
              ...chatAuthTarget,
              chatId,
              chatItemDataId: chat.dataId,
              collectionIdList,
              sourceId: item?.sourceId ?? selectedQuote?.sourceId,
              sourceName: item?.sourceName ?? selectedQuote?.sourceName
            }
    });
  });

  return (
    <Flex data-chat-id={chat.dataId} direction={'column'} gap={4}>
      {/* Workflow status */}
      {!isHumanMessage &&
        isChatLog &&
        !!chatStatusMap &&
        statusBoxData &&
        isLastChild &&
        showRunningStatus && (
          <Flex w={'100%'} alignItems={'center'} gap={2} justifyContent={styleMap.justifyContent}>
            <Flex
              alignItems={'center'}
              minW={0}
              maxW={'100%'}
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
                flexShrink={0}
              />
              <MyTooltip label={statusBoxData.name} showOnlyWhenOverflow>
                <Box
                  ml={2}
                  minW={0}
                  maxW={'320px'}
                  color={'myGray.600'}
                  overflow={'hidden'}
                  whiteSpace={'nowrap'}
                  textOverflow={'ellipsis'}
                >
                  {statusBoxData.name}
                </Box>
              </MyTooltip>
            </Flex>
          </Flex>
        )}

      {/* content */}
      {displayGroups.map((group, i) => {
        const isPlanCard =
          group.type === 'ai' && group.values.some((item) => item.plan || item.planStatus);

        const renderCommonFooter = () =>
          i === (isHumanMessage ? displayGroups.length - 1 : lastAiGroupIndex) ? (
            <>
              {/* error message */}
              {showInlineError && inlineErrorInfo && (
                <Box mt={4}>
                  <ChatErrorCard title={inlineErrorInfo.title} message={inlineErrorInfo.message} />
                </Box>
              )}
              {children}
            </>
          ) : null;

        if (group.type === 'human') {
          const select = getUserChatSelect(group.values);
          // 用户气泡的复制操作在正文下方，需要保留与普通 user 消息相同的空间。
          return (
            <Box
              key={i}
              className="chat-box-card"
              w={'100%'}
              maxW={boxBodyProps?.maxW ?? (isPc ? ChatBoxContentMaxWidth : 'calc(100% - 25px)')}
              mx={boxBodyProps?.mx ?? boxBodyProps?.margin ?? (isPc ? 'auto' : 0)}
              textAlign={styleMap.textAlign}
            >
              {select ? (
                <InteractiveReply reply={select} chatValue={group.values} chatTime={chat.time}>
                  {renderCommonFooter()}
                </InteractiveReply>
              ) : (
                <HumanChatBubble
                  chatValue={group.values}
                  chatTime={chat.time}
                  canEdit={!isChatting && !isChatLog}
                  onEditSubmit={onEditSubmit}
                >
                  {renderCommonFooter()}
                </HumanChatBubble>
              )}
            </Box>
          );
        }

        return (
          <Box
            key={i}
            className="chat-box-card"
            w={'100%'}
            maxW={boxBodyProps?.maxW ?? (isPc ? ChatBoxContentMaxWidth : 'calc(100% - 25px)')}
            mx={boxBodyProps?.mx ?? boxBodyProps?.margin ?? (isPc ? 'auto' : 0)}
            textAlign={styleMap.textAlign}
          >
            <AIChatBubble
              chat={chat}
              chatValue={group.values}
              isPlanCard={isPlanCard}
              isLastChild={isLastChild && i === displayGroups.length - 1}
              isLastValueGroup={i === lastAiGroupIndex}
              isChatting={isChatting}
              hasValidContent={hasValidAiContent}
              loadingText={showRunningStatus ? statusBoxData?.name : undefined}
              questionGuides={questionGuides}
              enableSandbox={enableSandbox}
              allowedCitationIds={allowedCitationIds}
              onOpenCiteModal={onOpenCiteModal}
              chatControllerProps={{
                ...props,
                isLastChild
              }}
            >
              {renderCommonFooter()}
            </AIChatBubble>
          </Box>
        );
      })}
    </Flex>
  );
};

export default React.memo(ChatItem);
