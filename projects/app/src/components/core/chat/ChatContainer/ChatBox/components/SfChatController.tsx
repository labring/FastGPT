import { useCopyData } from '@fastgpt/web/hooks/useCopyData';
import { Flex, type FlexProps, Box, Button, useDisclosure } from '@chakra-ui/react';
import MyTag from '@fastgpt/web/components/common/Tag/index';
import { type ChatSiteItemType } from '../type';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import React, { useMemo, useCallback } from 'react';
import { useTranslation } from 'next-i18next';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { formatChatValue2InputType } from '../utils';
import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import { ChatBoxContext } from '../Provider';
import { useContextSelector } from 'use-context-selector';
import { ChatRecordContext } from '@/web/core/chat/context/chatRecordContext';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { eventBus, EventNameEnum } from '@/web/common/utils/eventbus';
import dynamic from 'next/dynamic';
import { WorkflowRuntimeContext } from '../../context/workflowRuntimeContext';

const WholeResponseModal = dynamic(() => import('../../../components/WholeResponseModal'));
const AssistantDetailModal = dynamic(() => import('../../../components/AssistantDetailModal'));

export type ChatControllerProps = {
  isLastChild: boolean;
  chat: ChatSiteItemType;
  showVoiceIcon?: boolean;
  onRetry?: () => void;
  onDelete?: () => void;
  onMark?: () => void;
  onAddUserLike?: () => void;
  onAddUserDislike?: () => void;
  onToggleFeedbackReadStatus?: () => void;
  showFeedbackContent?: boolean;
  onToggleFeedbackContent?: () => void;
  onCorrectError?: () => void;
  /** 目前只在智能问答日志详情会传true */
  showExtraInfo?: boolean;
};

// icon color: Graphite Black/L70 ---------- #637A99
const controlIconStyle = {
  w: '12px',
  cursor: 'pointer',
  p: '6px',
  bg: 'white',
  color: 'myGray.450'
};
const controlContainerStyle = {
  className: 'control',
  color: 'myGray.450',
  display: 'flex'
};

const ChatController = ({
  chat,
  showVoiceIcon,
  onMark,
  onRetry,
  onDelete,
  onAddUserDislike,
  onAddUserLike,
  onToggleFeedbackReadStatus,
  showFeedbackContent,
  onToggleFeedbackContent,
  onCorrectError,
  showExtraInfo = false
}: ChatControllerProps & FlexProps) => {
  const { t } = useTranslation();
  const { copyData } = useCopyData();

  const isChatting = useContextSelector(ChatBoxContext, (v) => v.isChatting);
  const chatType = useContextSelector(ChatBoxContext, (v) => v.chatType);
  const isAssistantType = useContextSelector(ChatBoxContext, (v) => v.isAssistantType);

  const appId = useContextSelector(WorkflowRuntimeContext, (v) => v.appId);
  const chatId = useContextSelector(WorkflowRuntimeContext, (v) => v.chatId);
  const outLinkAuthData = useContextSelector(WorkflowRuntimeContext, (v) => v.outLinkAuthData);

  const chatText = useMemo(() => formatChatValue2InputType(chat.value).text || '', [chat.value]);

  const isLogMode = chatType === 'log';
  const notSharePage = chatType !== 'share';
  const isAIMsg = chat.obj === ChatRoleEnum.AI;

  // 查看详情模态框
  const {
    isOpen: isOpenDetailModal,
    onOpen: onOpenDetailModal,
    onClose: onCloseDetailModal
  } = useDisclosure();

  const handleViewDetail = useCallback(() => {
    onOpenDetailModal();
  }, [onOpenDetailModal]);

  const {
    runAsync: requestOnToggleFeedbackReadStatus,
    loading: isLoadingOnToggleFeedbackReadStatus
  } = useRequest(async () => onToggleFeedbackReadStatus?.(), {
    manual: true,
    onSuccess: () => {
      eventBus.emit(EventNameEnum.refreshFeedback);
    }
  });

  // 调试操作区域：AI 消息且非分享页时展示
  const showDebugSection = isAIMsg && notSharePage;

  return (
    <>
      <Flex alignItems={'center'} gap={2}>
        {/* 调试操作区域 - 图标+文字格式，显示在前 */}
        {showDebugSection && (
          <>
            <Flex alignItems={'center'} gap={1}>
              <MyTooltip label={t('common:core.chat.response.Read complete response')}>
                <Flex
                  alignItems={'center'}
                  gap={'4px'}
                  px={2}
                  h={'24px'}
                  borderRadius={'4px'}
                  borderColor={'myGray.200'}
                  cursor={'pointer'}
                  color={'myGray.600'}
                  fontSize={'xs'}
                  _hover={{ color: 'primary.600', borderColor: 'primary.300' }}
                  onClick={handleViewDetail}
                >
                  <MyIcon name={'common/userInfo'} w={'12px'} />
                  <Box>{t('common:Detail')}</Box>
                </Flex>
              </MyTooltip>
              {!!onCorrectError && (
                <MyTooltip label={t('app:chat_item_correct_error')}>
                  <Flex
                    alignItems={'center'}
                    gap={'4px'}
                    px={2}
                    h={'24px'}
                    borderRadius={'4px'}
                    borderColor={'myGray.200'}
                    cursor={'pointer'}
                    color={'myGray.600'}
                    fontSize={'xs'}
                    _hover={{ color: 'primary.600', borderColor: 'primary.300' }}
                    onClick={onCorrectError}
                  >
                    <MyIcon name={'kbTest'} w={'12px'} />
                    <Box>{t('app:chat_item_correct_error')}</Box>
                  </Flex>
                </MyTooltip>
              )}
            </Flex>
            {/* 分隔线 */}
            <Box w={'1px'} h={'14px'} bg={'myGray.200'} flexShrink={0} />
          </>
        )}

        {/* 用户操作区域 - 单图标格式 */}
        <Flex {...controlContainerStyle} alignItems={'center'}>
          <MyTooltip label={t('common:Copy')}>
            <MyIcon
              {...controlIconStyle}
              name={'copy'}
              _hover={{ color: 'primary.600' }}
              onClick={() => copyData(chatText)}
            />
          </MyTooltip>
          {!!onRetry && !isChatting && chatType !== 'log' && (
            <MyTooltip label={t('common:core.chat.retry')}>
              <MyIcon
                {...controlIconStyle}
                name={'common/retryLight'}
                _hover={{ color: 'green.500' }}
                onClick={onRetry}
              />
            </MyTooltip>
          )}
          {!!onDelete && !isChatting && chatType !== 'log' && (
            <MyTooltip label={t('common:Delete')}>
              <MyIcon
                {...controlIconStyle}
                name={'delete'}
                _hover={{ color: 'red.600' }}
                onClick={onDelete}
              />
            </MyTooltip>
          )}
          {!!onMark && !isAssistantType && (
            <MyTooltip label={t('common:core.chat.Mark')}>
              <MyIcon
                {...controlIconStyle}
                name={'core/app/markLight'}
                _hover={{ color: '#67c13b' }}
                onClick={onMark}
              />
            </MyTooltip>
          )}
          {isAIMsg && (
            <>
              {/* 日志模式下，始终展示赞/踩 */}
              {isLogMode ? (
                <>
                  {!!chat.userGoodFeedback && (
                    <Box position={'relative'}>
                      <MyIcon
                        {...controlIconStyle}
                        color={'green.500'}
                        name={'core/chat/feedback/goodLight'}
                        cursor={'not-allowed'}
                      />
                      {!chat.isFeedbackRead && (
                        <Box
                          position={'absolute'}
                          top={'-2px'}
                          right={'-2px'}
                          w={'8px'}
                          h={'8px'}
                          bg={'red.500'}
                          borderRadius={'full'}
                          border={'1px solid white'}
                        />
                      )}
                    </Box>
                  )}

                  {!!chat.userBadFeedback && (
                    <Box position={'relative'}>
                      <MyIcon
                        {...controlIconStyle}
                        color={'yellow.500'}
                        name={'core/chat/feedback/badLight'}
                        cursor={'not-allowed'}
                      />
                      {!chat.isFeedbackRead && (
                        <Box
                          position={'absolute'}
                          top={'-2px'}
                          right={'-2px'}
                          w={'8px'}
                          h={'8px'}
                          bg={'red.500'}
                          borderRadius={'full'}
                          border={'1px solid white'}
                        />
                      )}
                    </Box>
                  )}
                </>
              ) : (
                <>
                  {!!onAddUserLike && (
                    <MyIcon
                      {...controlIconStyle}
                      {...(!!chat.userGoodFeedback
                        ? {
                            color: 'white',
                            bg: 'green.500'
                          }
                        : {
                            _hover: { color: 'green.600' }
                          })}
                      name={'core/chat/feedback/goodLight'}
                      onClick={onAddUserLike}
                    />
                  )}
                  {!!onAddUserDislike && (
                    <MyIcon
                      {...controlIconStyle}
                      {...(!!chat.userBadFeedback
                        ? {
                            color: 'white',
                            bg: 'yellow.500'
                          }
                        : {
                            _hover: { color: 'yellow.500' }
                          })}
                      name={'core/chat/feedback/badLight'}
                      onClick={onAddUserDislike}
                    />
                  )}
                </>
              )}
            </>
          )}
        </Flex>
        {isAIMsg && showExtraInfo && !!chat.correctionId && (
          <MyTag
            ml={1}
            type={'borderFill'}
            fontSize={'10px'}
            height={'22px'}
            showDot
            colorSchema="green"
            border={'none'}
            borderRadius={'22px'}
          >
            {t('app:chat_item_optimized')}
          </MyTag>
        )}

        {onToggleFeedbackReadStatus &&
          isAIMsg &&
          (chat.userGoodFeedback || chat.userBadFeedback) && (
            <>
              {chat.isFeedbackRead ? (
                <Button
                  variant={'unstyled'}
                  alignItems={'center'}
                  fontSize={'xs'}
                  color={'myGray.500'}
                  cursor={'pointer'}
                  _hover={{ color: 'primary.600' }}
                  isLoading={isLoadingOnToggleFeedbackReadStatus}
                  onClick={requestOnToggleFeedbackReadStatus}
                >
                  {t('chat:log.feedback.read')}
                </Button>
              ) : (
                <Button
                  size={'xs'}
                  variant={'whitePrimaryOutline'}
                  fontSize={'xs'}
                  h={'22px'}
                  isLoading={isLoadingOnToggleFeedbackReadStatus}
                  onClick={requestOnToggleFeedbackReadStatus}
                >
                  {t('chat:log.feedback.mark_as_read')}
                </Button>
              )}
              {chat.userBadFeedback && onToggleFeedbackContent && !showFeedbackContent && (
                <Button
                  size={'xs'}
                  variant={'grayGhost'}
                  fontSize={'xs'}
                  h={'22px'}
                  onClick={onToggleFeedbackContent}
                  color={'primary.600'}
                >
                  {t('chat:log.feedback.show_feedback')}
                </Button>
              )}
            </>
          )}
      </Flex>

      {/* 查看详情模态框 */}
      {isOpenDetailModal && isAssistantType && (
        <AssistantDetailModal
          isOpen={isOpenDetailModal}
          onClose={onCloseDetailModal}
          dataId={chat.dataId}
          appId={appId}
          chatId={chatId}
          outLinkAuthData={outLinkAuthData}
        />
      )}
      {isOpenDetailModal && !isAssistantType && (
        <WholeResponseModal
          dataId={chat.dataId}
          chatTime={chat.time || new Date()}
          onClose={onCloseDetailModal}
        />
      )}
    </>
  );
};

export default React.memo(ChatController);
