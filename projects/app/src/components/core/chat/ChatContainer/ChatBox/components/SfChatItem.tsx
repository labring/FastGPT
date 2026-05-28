import { Box, type BoxProps, Card, Flex, Button, Text } from '@chakra-ui/react';
import React, { useMemo, useState } from 'react';
import ChatController, { type ChatControllerProps } from './SfChatController';
import ChatAvatar from './ChatAvatar';
import { MessageCardStyle } from '../constants';
import { formatChatValue2InputType } from '../utils';
import Markdown from '@/components/Markdown';
import styles from '../index.module.scss';
import { ChatItemValueTypeEnum, ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import type { ChatStatusEnum } from '@fastgpt/global/core/chat/constants';
import FilesBlock from './FilesBox';
import { ChatBoxContext } from '../Provider';
import { useContextSelector } from 'use-context-selector';
import { WorkflowRuntimeContext } from '../../context/workflowRuntimeContext';
import AIResponseBox from '../../../components/AIResponseBox';
import { useCopyData } from '@fastgpt/web/hooks/useCopyData';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import MyTag from '@fastgpt/web/components/common/Tag/index';
import { useTranslation } from 'next-i18next';
import {
  type AIChatItemValueItemType,
  type ChatItemValueItemType
} from '@fastgpt/global/core/chat/type';
import { isEqual } from 'lodash';
import { EventNameEnum, eventBus } from '@/web/common/utils/eventbus';
import { ConfirmPlanAgentText } from '@fastgpt/global/core/workflow/runtime/constants';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import { formatTimeToChatItemTime } from '@fastgpt/global/common/string/time';
import dayjs from 'dayjs';
import {
  ChatItemContext,
  type OnOpenCiteModalProps
} from '@/web/core/chat/context/chatItemContext';
import { addStatisticalDataToHistoryItem } from '@/global/core/chat/utils';
import type { CiteSourceInfo } from '@/components/Markdown/A';
import dynamic from 'next/dynamic';
import { useMemoizedFn } from 'ahooks';
import ChatBoxDivider from '../../../Divider';
import { useMemoEnhance } from '@fastgpt/web/hooks/useMemoEnhance';
import BuildingAnimation from '@/pageComponents/dataset/detail/components/BuildingAnimation';

const ResponseTags = dynamic(() => import('./SfResponseTags'));

type BasicProps = {
  avatar?: string;
  statusBoxData?: {
    status: `${ChatStatusEnum}`;
    name: string;
  };
  questionGuides?: string[];
  children?: React.ReactNode;
  hideCiteIcon?: boolean;
  datasetReadPerMap?: Record<string, boolean>;
  hasPlanCheck?: boolean;
} & ChatControllerProps;

type Props = BasicProps & {
  type: ChatRoleEnum.Human | ChatRoleEnum.AI;
  debuggerMode?: boolean;
};

const RenderQuestionGuide = ({ questionGuides }: { questionGuides: string[] }) => {
  return (
    <Flex flexDirection="column" alignItems="flex-start" gap={2} mt={4} ml={4}>
      {questionGuides.map((text) => (
        <Flex
          key={text}
          display="inline-flex"
          alignItems="center"
          bg={'myGray.50'}
          borderRadius="8px"
          px="12px"
          h="32px"
          fontSize="sm"
          color={'myGray.500'}
          cursor="pointer"
          onClick={() => eventBus.emit(EventNameEnum.sendQuestion, { text })}
        >
          {text}
        </Flex>
      ))}
    </Flex>
  );
};

const HumanContentCard = React.memo(
  function HumanContentCard({ chatValue }: { chatValue: ChatItemValueItemType[] }) {
    const { text, files = [] } = formatChatValue2InputType(chatValue);
    return (
      <Flex flexDirection={'column'} gap={4}>
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
  isChatting,
  questionGuides,
  onOpenCiteModal,
  hideCiteIcon,
  durationSeconds,
  citeSourceMap,
  statusBoxData,
  debuggerMode
}: {
  dataId: string;
  chatValue: AIChatItemValueItemType[];
  isLastChild: boolean;
  isChatting: boolean;
  questionGuides: string[];
  onOpenCiteModal: (e?: OnOpenCiteModalProps) => void;
  hideCiteIcon?: boolean;
  durationSeconds?: number;
  citeSourceMap?: Map<string, CiteSourceInfo>;
  statusBoxData?: BasicProps['statusBoxData'];
  debuggerMode?: boolean;
}) {
  const showRunningStatus = useContextSelector(ChatItemContext, (v) => v.showRunningStatus);

  const showStatusTag =
    !!statusBoxData?.status && statusBoxData && isLastChild && showRunningStatus && debuggerMode;

  return (
    <Flex flexDirection={'column'} gap={2}>
      {chatValue.map((value, i) => {
        const key = `${dataId}-ai-${i}`;
        const isLastValue = isLastChild && i === chatValue.length - 1;

        if (
          isLastValue &&
          isChatting &&
          !value.text?.content?.trim() &&
          !value.reasoning?.content?.trim()
        ) {
          return (
            <Flex key={key} alignItems={'center'} gap={2}>
              <BuildingAnimation size={12} />
              {showStatusTag && (
                <Box color={'myGray.600'} fontSize={'12px'}>
                  {statusBoxData.name}
                </Box>
              )}
            </Flex>
          );
        }

        return (
          <AIResponseBox
            chatItemDataId={dataId}
            key={key}
            value={value}
            isLastResponseValue={isLastChild && i === chatValue.length - 1}
            isLastChild={isLastChild}
            isChatting={isChatting}
            hideCursor={true}
            onOpenCiteModal={onOpenCiteModal}
            hideCiteIcon={hideCiteIcon}
            durationSeconds={durationSeconds}
            citeSourceMap={citeSourceMap}
          />
        );
      })}
    </Flex>
  );
});

const ChatItem = (props: Props) => {
  const {
    type,
    avatar,
    statusBoxData,
    children,
    isLastChild,
    questionGuides = [],
    chat,
    hideCiteIcon,
    datasetReadPerMap = {},
    showExtraInfo = false,
    hasPlanCheck = false
  } = props;

  const { t } = useTranslation();
  const { isPc } = useSystem();

  const [showFeedbackContent, setShowFeedbackContent] = useState(false);

  const styleMap: BoxProps = useMemoEnhance(
    () => ({
      ...(type === ChatRoleEnum.Human
        ? {
            order: 0,
            borderRadius: '8px',
            justifyContent: 'flex-end',
            textAlign: 'right',
            bg: 'blue.100',
            padding: '12px'
          }
        : {
            order: 1,
            borderRadius: '0 8px 8px 8px',
            justifyContent: 'flex-start',
            textAlign: 'left',
            bg: 'transparent'
          }),
      fontSize: 'mini',
      fontWeight: '400',
      color: 'myGray.500'
    }),
    [type]
  );

  const isChatting = useContextSelector(ChatBoxContext, (v) => v.isChatting);
  const chatType = useContextSelector(ChatBoxContext, (v) => v.chatType);
  const isAssistantType = useContextSelector(ChatBoxContext, (v) => v.isAssistantType);

  const appId = useContextSelector(WorkflowRuntimeContext, (v) => v.appId);
  const chatId = useContextSelector(WorkflowRuntimeContext, (v) => v.chatId);
  const outLinkAuthData = useContextSelector(WorkflowRuntimeContext, (v) => v.outLinkAuthData);
  const isShowFullText = useContextSelector(ChatItemContext, (v) => v.isShowFullText);

  const { totalQuoteList: quoteList = [] } = useMemo(
    () => addStatisticalDataToHistoryItem(chat),
    [chat]
  );

  const citeSourceMap = useMemo(() => {
    const map = new Map<string, CiteSourceInfo>();
    quoteList.forEach((item) => {
      if (item.id && !map.has(item.id)) {
        map.set(item.id, {
          sourceName: item.sourceName,
          datasetId: item.datasetId,
          collectionId: item.collectionId
        });
      }
    });
    return map;
  }, [quoteList]);

  const isChatLog = chatType === 'log';

  const { copyData } = useCopyData();

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
    if (isLastChild && (isChatting || groupedValues.length === 0)) {
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
    } else if (groupedValues.length === 0) {
      groupedValues.push([
        {
          type: ChatItemValueTypeEnum.text,
          text: {
            content: ''
          }
        }
      ]);
    }

    return groupedValues;
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
    <Box
      data-chat-id={chat.dataId}
      _hover={{
        '& .time-label': {
          display: 'block'
        }
      }}
    >
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
            {...MessageCardStyle}
            bg={styleMap.bg}
            borderRadius={styleMap.borderRadius}
            p={styleMap.padding}
            textAlign={'left'}
            pb={0}
            {...(type === ChatRoleEnum.AI && { display: 'block', w: '100%', maxW: '100%', pr: 0 })}
          >
            {type === ChatRoleEnum.Human && <HumanContentCard chatValue={value} />}
            {type === ChatRoleEnum.AI && (
              <>
                <AIContentCard
                  chatValue={value}
                  dataId={chat.dataId}
                  isLastChild={isLastChild && i === splitAiResponseResults.length - 1}
                  isChatting={isChatting}
                  questionGuides={questionGuides}
                  onOpenCiteModal={onOpenCiteModal}
                  hideCiteIcon={hideCiteIcon}
                  durationSeconds={chat.durationSeconds}
                  citeSourceMap={citeSourceMap}
                  statusBoxData={statusBoxData}
                  debuggerMode={props.debuggerMode}
                />
                {i === splitAiResponseResults.length - 1 && (
                  <ResponseTags
                    showTags={!isLastChild || !isChatting}
                    historyItem={chat}
                    onOpenCiteModal={onOpenCiteModal}
                    datasetReadPerMap={datasetReadPerMap}
                  />
                )}
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
        </Box>
      ))}

      {/* Rewrite standardized query */}
      {showExtraInfo &&
        type === ChatRoleEnum.Human &&
        chat.rewriteStandardizedQuery &&
        formatChatValue2InputType(chat.value).text !== chat.rewriteStandardizedQuery && (
          <Box
            textAlign="right"
            fontSize="12px"
            color="#999999"
            mt={2}
            p={2}
            borderRight="2px solid"
            borderColor="myGray.200"
            pr={'10px'}
          >
            {t('app:chat_item_rewrite')}：{chat.rewriteStandardizedQuery}
          </Box>
        )}

      <Flex alignItems={'center'} mt={2}>
        <Flex
          w={'100%'}
          alignItems={'center'}
          gap={2}
          justifyContent={styleMap.justifyContent}
          ml={type === ChatRoleEnum.AI ? 4 : 0}
        >
          {isChatting && type === ChatRoleEnum.AI && isLastChild ? null : (
            <Flex order={styleMap.order} ml={styleMap.ml} align={'center'} gap={'0.62rem'}>
              {chat.time && (isPc || isChatLog) && (
                <Box
                  order={type === ChatRoleEnum.AI ? 2 : 0}
                  className={'time-label'}
                  fontSize={styleMap.fontSize}
                  color={styleMap.color}
                  fontWeight={styleMap.fontWeight}
                  display={isChatLog ? 'block' : 'none'}
                >
                  {t(formatTimeToChatItemTime(chat.time) as any, {
                    time: dayjs(chat.time).format('HH:mm')
                  }).replace('#', ':')}
                </Box>
              )}
              <ChatController
                {...props}
                isLastChild={isLastChild}
                showFeedbackContent={showFeedbackContent}
                onToggleFeedbackContent={() => setShowFeedbackContent(!showFeedbackContent)}
              />
            </Flex>
          )}
        </Flex>
        {/* 反馈标签区域：好评、差评、未命中知识库 */}
        {showExtraInfo && chat.obj === ChatRoleEnum.AI && (
          <Flex ml={'auto'} gap={1}>
            {!!chat.userGoodFeedback && (
              <MyTag colorSchema="green">
                <MyIcon name="core/chat/feedback/goodLight" w="14px" h="14px" mr={1} />
                <Text fontSize="xs" fontWeight={500}>
                  {t('app:chat_item_liked')}
                </Text>
              </MyTag>
            )}
            {!!chat.userBadFeedback && (
              <MyTooltip label={chat.userBadFeedback}>
                <MyTag colorSchema="yellow">
                  <MyIcon name="core/chat/feedback/badLight" w="14px" h="14px" mr={1} />
                  <Text fontSize="xs" fontWeight={500}>
                    {chat.userBadFeedback.length > 20
                      ? chat.userBadFeedback.substring(0, 20) + '...'
                      : chat.userBadFeedback}
                  </Text>
                </MyTag>
              </MyTooltip>
            )}
            {isAssistantType && chat.quoteList && chat.quoteList.length === 0 && (
              <MyTag colorSchema="pink" showDot={false}>
                <Flex alignItems={'center'}>
                  <MyIcon w={'14px'} name="common/info" mr={1} />
                  <Text fontSize="xs" fontWeight={500}>
                    {t('app:logs_filter_not_found_knowledge')}
                  </Text>
                </Flex>
              </MyTag>
            )}
          </Flex>
        )}
      </Flex>
      {isLastChild && questionGuides.length > 0 && (
        <RenderQuestionGuide questionGuides={questionGuides} />
      )}
      {hasPlanCheck && isLastChild && (
        <Flex mt={3}>
          <Button
            leftIcon={<MyIcon name={'common/check'} w={'16px'} />}
            variant={'primaryOutline'}
            onClick={() => {
              eventBus.emit(EventNameEnum.sendQuestion, {
                text: ConfirmPlanAgentText,
                focus: true
              });
            }}
          >
            {t('chat:confirm_plan')}
          </Button>
        </Flex>
      )}
    </Box>
  );
};

export default React.memo(ChatItem);
