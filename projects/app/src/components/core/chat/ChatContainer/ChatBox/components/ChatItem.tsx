import { Box, type BoxProps, Button, Flex } from '@chakra-ui/react';
import React, { useMemo, useState, useRef } from 'react';
import ChatController, { type ChatControllerProps } from './ChatController';
import styles from '../index.module.scss';
import { ChatRoleEnum, ChatStatusEnum } from '@fastgpt/global/core/chat/constants';
import { ChatBoxContext } from '../Provider';
import { useContextSelector } from 'use-context-selector';
import { WorkflowRuntimeContext } from '../../context/workflowRuntimeContext';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useTranslation } from 'next-i18next';
import type { UserChatItemValueItemType } from '@fastgpt/global/core/chat/type';
import { type AIChatItemValueItemType } from '@fastgpt/global/core/chat/type';
import {
  ChatItemContext,
  type OnOpenCiteModalProps
} from '@/web/core/chat/context/chatItemContext';
import { addStatisticalDataToHistoryItem } from '@/global/core/chat/utils';
import { useMemoizedFn, useSize } from 'ahooks';
import ChatBoxDivider from '../../../Divider';
import { useMemoEnhance } from '@fastgpt/web/hooks/useMemoEnhance';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import HumanChatBubble from './HumanChatBubble';
import AIChatBubble, { shouldFilterAiValue } from './AIChatBubble';
import type { ChatBoxInputType } from '../type';
import { hasAiAnswerContent } from './AIChatBubble/utils';

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

  // Error variables
  const [errorExpanded, setErrorExpanded] = useState(false);
  const errorContentRef = useRef<HTMLDivElement>(null);
  const errorContentSize = useSize(errorContentRef);
  const errorContentOverflow = (errorContentSize?.height || 0) > 100;

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
  const chatType = useContextSelector(ChatBoxContext, (v) => v.chatType);
  const showRunningStatus = useContextSelector(ChatItemContext, (v) => v.showRunningStatus);
  const isHumanMessage = chat.obj === ChatRoleEnum.Human;
  const { isPc } = useSystem();

  const appId = useContextSelector(WorkflowRuntimeContext, (v) => v.appId);
  const chatId = useContextSelector(WorkflowRuntimeContext, (v) => v.chatId);
  const outLinkAuthData = useContextSelector(WorkflowRuntimeContext, (v) => v.outLinkAuthData);
  const isShowFullText = useContextSelector(ChatItemContext, (v) => v.isShowFullText);

  const { totalQuoteList: quoteList = [], errorText } = useMemoEnhance(
    () => addStatisticalDataToHistoryItem(chat),
    [chat]
  );

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
    <Box data-chat-id={chat.dataId}>
      {/* Workflow status */}
      {!isHumanMessage && isChatLog && !!chatStatusMap && statusBoxData && isLastChild && showRunningStatus && (
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
          ) : null;

        if (chat.obj === ChatRoleEnum.Human) {
          return (
            <Box
              key={i}
              mt={['6px', 2]}
              className="chat-box-card"
              w={'100%'}
              maxW={isPc ? '700px' : 'calc(100% - 25px)'}
              mx={isPc ? 'auto' : 0}
              textAlign={styleMap.textAlign}
            >
              <HumanChatBubble
                chatValue={value as UserChatItemValueItemType[]}
                chatTime={i === splitAiResponseResults.length - 1 ? chat.time : undefined}
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
            mt={['6px', 2]}
            className="chat-box-card"
            w={'100%'}
            maxW={isPc ? '700px' : 'calc(100% - 25px)'}
            mx={isPc ? 'auto' : 0}
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

      {isChatLog && chat.obj === ChatRoleEnum.AI && errorText && (
        <Box
          mt={2}
          maxW={'500px'}
          border={'1px solid'}
          borderColor={'myGray.200'}
          borderRadius={'md'}
          p={3}
          bg={'white'}
        >
          <Flex alignItems={'center'} mb={2}>
            <MyIcon name={'common/warn'} w={'16px'} color={'yellow.500'} mr={2} />
            <Box fontSize={'mini'} fontWeight={'medium'} color={'myGray.600'}>
              {t('chat:log.error.error_prefix')} - {errorText.moduleName}
            </Box>
          </Flex>
          <Box
            position={'relative'}
            maxH={errorExpanded ? '600px' : '100px'}
            overflow={errorExpanded ? 'auto' : 'hidden'}
          >
            <Box
              ref={errorContentRef}
              fontSize={'sm'}
              color={'myGray.500'}
              whiteSpace={'pre-wrap'}
              ml={6}
            >
              {errorText.errorText}
            </Box>
            {!errorExpanded && errorContentOverflow && (
              <Box
                position={'absolute'}
                bottom={0}
                left={0}
                right={0}
                h={'50px'}
                bgGradient={'linear(to-b, transparent, white)'}
                pointerEvents={'none'}
              />
            )}
          </Box>
          {errorContentOverflow && (
            <Flex
              justifyContent={'center'}
              bg={'myGray.150'}
              cursor={'pointer'}
              onClick={() => setErrorExpanded(!errorExpanded)}
              alignItems={'center'}
              py={1}
              backdropFilter={'blur(2px)'}
              borderBottomRadius={'sm'}
              fontSize={'10px'}
              fontWeight={'medium'}
              color={'myGray.600'}
              _hover={{
                bg: 'myGray.200'
              }}
              mx={-3}
              mb={-3}
              mt={2}
            >
              {errorExpanded ? t('chat:log.error.collapse') : t('chat:log.error.expand')}
              <MyIcon
                name={errorExpanded ? 'core/chat/chevronUp' : 'core/chat/chevronDown'}
                w={'12px'}
                ml={1}
              />
            </Flex>
          )}
        </Box>
      )}
    </Box>
  );
};

export default React.memo(ChatItem);
