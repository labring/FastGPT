import { Box, type BoxProps, Flex } from '@chakra-ui/react';
import React, { useMemo } from 'react';
import { type ChatControllerProps } from './ChatController';
import styles from '../index.module.scss';
import { ChatRoleEnum, ChatStatusEnum } from '@fastgpt/global/core/chat/constants';
import { ChatBoxContext } from '../Provider';
import { useContextSelector } from 'use-context-selector';
import { WorkflowRuntimeContext } from '../../context/workflowRuntimeContext';
import { useTranslation } from 'next-i18next';
import type { UserChatItemValueItemType } from '@fastgpt/global/core/chat/type';
import { type AIChatItemValueItemType } from '@fastgpt/global/core/chat/type';
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
import AIChatBubble, { shouldFilterAiValue } from './AIChatBubble';
import type { ChatBoxInputType } from '../type';
import { groupAIChatResponseValues } from './AIChatBubble/utils';
import ChatErrorCard from './ChatErrorCard';
import { shouldShowChatItemInlineError } from '../utils/error';
import { toChatAuthApiTarget } from '@/web/core/chat/utils';
import { ChatBoxContentMaxWidth } from '../constants';

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
  const collapseIntermediateAgentResponses = useContextSelector(
    ChatBoxContext,
    (v) => v.collapseIntermediateAgentResponses ?? false
  );
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

    const moduleName =
      errorText?.moduleName ||
      chat.moduleName ||
      t('common:core.module.template.ai_chat', { defaultValue: 'AI 对话' });

    return {
      title: `${t('chat:log.error.error_prefix')} - ${t(moduleName)}`,
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

  /*
    1. The interactive node is divided into n dialog boxes.
    2. Auto-complete the last textnode
  */
  const splitAiResponseResults = useMemo(() => {
    if (chat.obj === ChatRoleEnum.Human) return [chat.value];

    if (chat.obj === ChatRoleEnum.AI) {
      return groupAIChatResponseValues({
        chatValue: chat.value,
        isLastChild,
        isChatting,
        collapseIntermediateAgentResponses
      });
    }

    return [];
  }, [chat.obj, chat.value, collapseIntermediateAgentResponses, isChatting, isLastChild]);
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
          </Flex>
        )}

      {/* content */}
      {splitAiResponseResults.map((value, i) => {
        const isPlanCard =
          chat.obj === ChatRoleEnum.AI &&
          (value as AIChatItemValueItemType[]).some((item) => item.plan || item.planStatus);

        const renderCommonFooter = () =>
          i === splitAiResponseResults.length - 1 ? (
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

        if (chat.obj === ChatRoleEnum.Human) {
          return (
            <Box
              key={i}
              className="chat-box-card"
              w={'100%'}
              maxW={boxBodyProps?.maxW ?? (isPc ? ChatBoxContentMaxWidth : 'calc(100% - 25px)')}
              mx={boxBodyProps?.mx ?? boxBodyProps?.margin ?? (isPc ? 'auto' : 0)}
              textAlign={styleMap.textAlign}
            >
              <HumanChatBubble
                chatValue={value as UserChatItemValueItemType[]}
                chatTime={i === splitAiResponseResults.length - 1 ? chat.time : undefined}
                canEdit={!isChatting && !isChatLog}
                onEditSubmit={onEditSubmit}
              >
                {renderCommonFooter()}
              </HumanChatBubble>
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
              chatValue={value as AIChatItemValueItemType[]}
              isPlanCard={isPlanCard}
              isLastChild={isLastChild}
              isLastValueGroup={i === splitAiResponseResults.length - 1}
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
