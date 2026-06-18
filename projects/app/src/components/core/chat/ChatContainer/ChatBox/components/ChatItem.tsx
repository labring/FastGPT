import { Box, type BoxProps, Button, Flex } from '@chakra-ui/react';
import React, { useMemo, useState } from 'react';
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
import { ChatItemContext } from '@/web/core/chat/context/chatItemContext';
import { addStatisticalDataToHistoryItem } from '@/global/core/chat/utils';
import { useMemoizedFn } from 'ahooks';
import { useMemoEnhance } from '@fastgpt/web/hooks/useMemoEnhance';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import HumanChatBubble from './HumanChatBubble';
import AIChatBubble, { shouldFilterAiValue } from './AIChatBubble';
import type { ChatBoxInputType } from '../type';
import { hasAiAnswerContent } from './AIChatBubble/utils';
import ChatErrorCard from './ChatErrorCard';
import { shouldShowChatItemInlineError } from '../utils/error';

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
  onEditSubmit?: (input: ChatBoxInputType) => void | Promise<void>;
  children?: React.ReactNode;
} & ChatControllerProps;

const ChatItem = (props: Props) => {
  const { statusBoxData, children, isLastChild, questionGuides = [], chat, onEditSubmit } = props;

  const { t } = useTranslation();

  const [showFeedbackContent, setShowFeedbackContent] = useState(false);

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

  const appId = useContextSelector(WorkflowRuntimeContext, (v) => v.appId);
  const chatId = useContextSelector(WorkflowRuntimeContext, (v) => v.chatId);
  const outLinkAuthData = useContextSelector(WorkflowRuntimeContext, (v) => v.outLinkAuthData);
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
      // Remove empty text node
      const filterList = chat.value.filter((item) => !shouldFilterAiValue(item));

      const groupedValues: AIChatItemValueItemType[][] = [];
      let currentGroup: AIChatItemValueItemType[] = [];

      filterList.forEach((value) => {
        if (value.interactive) {
          if (currentGroup.length > 0) {
            groupedValues.push(currentGroup);
            currentGroup = [];
          }

          groupedValues.push([value]);
          return;
        }

        currentGroup.push(value);

        if (hasAiAnswerContent(value)) {
          groupedValues.push(currentGroup);
          currentGroup = [];
        }
      });

      if (currentGroup.length > 0) {
        groupedValues.push(currentGroup);
      }

      // Check last group is interactive, Auto add a empty text node(animation)
      const lastGroup = groupedValues[groupedValues.length - 1];
      if (isLastChild && (isChatting || groupedValues.length === 0)) {
        if (
          (lastGroup &&
            lastGroup[lastGroup.length - 1] &&
            lastGroup[lastGroup.length - 1].interactive) ||
          groupedValues.length === 0
        ) {
          groupedValues.push([
            {
              text: {
                content: ''
              }
            }
          ]);
        }
      } else if (groupedValues.length === 0) {
        // 对于非最后一条的空 AI 消息，也补充一个空节点，避免消息"消失"
        groupedValues.push([
          {
            text: {
              content: ''
            }
          }
        ]);
      }

      return groupedValues;
    }

    return [];
  }, [chat.obj, chat.value, isChatting, isLastChild]);

  const setCiteModalData = useContextSelector(ChatItemContext, (v) => v.setCiteModalData);
  const onOpenCiteModal = useMemoizedFn(
    (item?: {
      collectionId?: string;
      sourceId?: string;
      sourceName?: string;
      datasetId?: string;
      quoteId?: string;
    }) => {
      const collectionIdList = item?.collectionId
        ? [item.collectionId]
        : [...new Set(quoteList.map((item) => item.collectionId))];

      setCiteModalData({
        rawSearch: quoteList,
        metadata:
          item?.collectionId && isShowFullText
            ? {
                appId: appId,
                chatId: chatId,
                chatItemDataId: chat.dataId,
                collectionId: item.collectionId,
                collectionIdList,
                sourceId: item.sourceId || '',
                sourceName: item.sourceName || '',
                datasetId: item.datasetId || '',
                outLinkAuthData,
                quoteId: item.quoteId
              }
            : {
                appId: appId,
                chatId: chatId,
                chatItemDataId: chat.dataId,
                collectionIdList,
                sourceId: item?.sourceId,
                sourceName: item?.sourceName,
                outLinkAuthData
              }
      });
    }
  );

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

      {/* User Feedback Content: Admin log show */}
      {isChatLog &&
        showFeedbackContent &&
        chat.obj === ChatRoleEnum.AI &&
        (chat.userGoodFeedback || chat.userBadFeedback) && (
          <Box
            mt={2}
            maxW={'250'}
            border={'1px solid'}
            borderColor={'myGray.250'}
            borderRadius={'md'}
            p={3}
          >
            <Box fontSize={'sm'} color={'myGray.900'} whiteSpace={'pre-wrap'}>
              {chat.userBadFeedback || chat.userGoodFeedback}
            </Box>
            <Flex justifyContent={'flex-end'} mt={2}>
              <Button
                size={'xs'}
                variant={'grayGhost'}
                fontSize={'xs'}
                onClick={() => setShowFeedbackContent(false)}
                color={'primary.600'}
              >
                {t('chat:log.feedback.hide_feedback')}
              </Button>
            </Flex>
          </Box>
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
              maxW={boxBodyProps?.maxW ?? (isPc ? '700px' : 'calc(100% - 25px)')}
              mx={boxBodyProps?.mx ?? boxBodyProps?.margin ?? (isPc ? 'auto' : 0)}
              textAlign={styleMap.textAlign}
            >
              <HumanChatBubble
                chatValue={value as UserChatItemValueItemType[]}
                chatTime={i === splitAiResponseResults.length - 1 ? chat.time : undefined}
                canEdit={!isChatting}
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
            maxW={boxBodyProps?.maxW ?? (isPc ? '700px' : 'calc(100% - 25px)')}
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
              loadingText={showRunningStatus ? statusBoxData?.name : undefined}
              questionGuides={questionGuides}
              allowedCitationIds={allowedCitationIds}
              onOpenCiteModal={onOpenCiteModal}
              chatControllerProps={{
                ...props,
                isLastChild,
                showFeedbackContent,
                onToggleFeedbackContent: () => setShowFeedbackContent(!showFeedbackContent)
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
