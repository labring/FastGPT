import { useCopyData } from '@fastgpt/web/hooks/useCopyData';
import { Flex, type FlexProps, Box, Button } from '@chakra-ui/react';
import type { ChatSiteItemType } from '../type';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import React, { useMemo } from 'react';
import { useTranslation } from 'next-i18next';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { formatChatValue2InputType } from '../utils/chatValue';
import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import { ChatBoxContext } from '../Provider';
import { useContextSelector } from 'use-context-selector';
import MyImage from '@fastgpt/web/components/common/Image/MyImage';
import { ChatRecordContext } from '@/web/core/chat/context/chatRecordContext';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { eventBus, EventNameEnum } from '@/web/common/utils/eventbus';

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
  variant?: 'panel' | 'footer';
};

const controlIconStyle = {
  w: '14px',
  cursor: 'pointer',
  p: '5px',
  bg: 'white',
  borderRight: 'base'
};
const controlContainerStyle = {
  className: 'control',
  color: 'myGray.400',
  display: 'flex'
};

const footerIconStyle = {
  w: '16px',
  cursor: 'pointer',
  p: '4px',
  color: 'myGray.400',
  _hover: { color: 'primary.600' }
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
  variant = 'panel'
}: ChatControllerProps & FlexProps) => {
  const { t } = useTranslation();
  const { copyData } = useCopyData();

  const setChatRecords = useContextSelector(ChatRecordContext, (v) => v.setChatRecords);

  const isChatting = useContextSelector(ChatBoxContext, (v) => v.isChatting);
  const audioLoading = useContextSelector(ChatBoxContext, (v) => v.audioLoading);
  const audioPlaying = useContextSelector(ChatBoxContext, (v) => v.audioPlaying);
  const hasAudio = useContextSelector(ChatBoxContext, (v) => v.hasAudio);
  const playAudioByText = useContextSelector(ChatBoxContext, (v) => v.playAudioByText);
  const cancelAudio = useContextSelector(ChatBoxContext, (v) => v.cancelAudio);
  const audioPlayingChatId = useContextSelector(ChatBoxContext, (v) => v.audioPlayingChatId);
  const setAudioPlayingChatId = useContextSelector(ChatBoxContext, (v) => v.setAudioPlayingChatId);
  const chatType = useContextSelector(ChatBoxContext, (v) => v.chatType);

  const chatText = useMemo(() => formatChatValue2InputType(chat.value).text || '', [chat.value]);

  const isLogMode = chatType === 'log';
  const isFooter = variant === 'footer';
  const renderTooltip = (label: string, children: React.ReactNode) =>
    isFooter ? <>{children}</> : <MyTooltip label={label}>{children}</MyTooltip>;
  const iconStyle = isFooter ? footerIconStyle : controlIconStyle;
  const activeFeedbackStyle = isFooter
    ? {
        color: 'primary.600'
      }
    : {
        color: 'white',
        bg: 'green.500'
      };
  const activeBadFeedbackStyle = isFooter
    ? {
        color: 'primary.600'
      }
    : {
        color: 'white',
        bg: 'yellow.500'
      };

  const {
    runAsync: requestOnToggleFeedbackReadStatus,
    loading: isLoadingOnToggleFeedbackReadStatus
  } = useRequest(async () => onToggleFeedbackReadStatus?.(), {
    manual: true,
    onSuccess: () => {
      eventBus.emit(EventNameEnum.refreshFeedback);
    }
  });

  return (
    <>
      <Flex alignItems={'center'} gap={isFooter ? '4px' : 2}>
        <Flex
          {...(isFooter ? {} : controlContainerStyle)}
          className={isFooter ? undefined : controlContainerStyle.className}
          borderRadius={isFooter ? undefined : 'sm'}
          border={isFooter ? undefined : 'base'}
          alignItems={'center'}
          gap={isFooter ? '4px' : undefined}
          color={'myGray.400'}
          sx={{
            '& > :last-child svg': {
              borderRight: 'none',
              borderTopRightRadius: 'sm',
              borderBottomRightRadius: 'sm'
            }
          }}
        >
          {renderTooltip(
            t('common:Copy'),
            <MyIcon
              {...iconStyle}
              name={'copy'}
              borderLeftRadius={isFooter ? undefined : 'sm'}
              _hover={{ color: 'primary.600' }}
              onClick={() => copyData(chatText)}
            />
          )}
          {!!onDelete && !isChatting && chatType !== 'log' && (
            <>
              {onRetry &&
                renderTooltip(
                  t('common:core.chat.retry'),
                  <MyIcon
                    {...iconStyle}
                    name={'common/retryLight'}
                    _hover={{ color: isFooter ? 'primary.600' : 'green.500' }}
                    onClick={onRetry}
                  />
                )}
              {renderTooltip(
                t('common:Delete'),
                <MyIcon
                  {...iconStyle}
                  name={'delete'}
                  _hover={{ color: isFooter ? 'primary.600' : 'red.600' }}
                  onClick={onDelete}
                />
              )}
            </>
          )}
          {showVoiceIcon &&
            hasAudio &&
            (() => {
              const isPlayingChat = chat.dataId === audioPlayingChatId;
              if (isPlayingChat && audioPlaying) {
                return (
                  <Flex alignItems={'center'}>
                    {renderTooltip(
                      t('common:core.chat.tts.Stop Speech'),
                      <MyIcon
                        {...iconStyle}
                        borderRight={isFooter ? undefined : 'none'}
                        name={'core/chat/stopSpeech'}
                        color={isFooter ? 'primary.600' : '#E74694'}
                        onClick={cancelAudio}
                      />
                    )}
                    {!isFooter && (
                      <MyImage src="/icon/speaking.gif" w={'23px'} alt={''} borderRight={'base'} />
                    )}
                  </Flex>
                );
              }
              if (isPlayingChat && audioLoading) {
                return renderTooltip(
                  t('common:Loading'),
                  <MyIcon {...iconStyle} name={'common/loading'} />
                );
              }
              return renderTooltip(
                t('common:core.app.TTS start'),
                <MyIcon
                  {...iconStyle}
                  name={'core/chat/soundWave'}
                  color="currentColor"
                  sx={{
                    '& path': {
                      fill: 'currentColor'
                    }
                  }}
                  _hover={{ color: isFooter ? 'primary.600' : '#E74694' }}
                  onClick={async () => {
                    setAudioPlayingChatId(chat.dataId);
                    const response = await playAudioByText({
                      buffer: chat.ttsBuffer,
                      text: chatText
                    });

                    if (!setChatRecords || !response.buffer) return;
                    setChatRecords((state) =>
                      state.map((item) =>
                        item.dataId === chat.dataId
                          ? {
                              ...item,
                              ttsBuffer: response.buffer
                            }
                          : item
                      )
                    );
                  }}
                />
              );
            })()}
          {!!onMark &&
            renderTooltip(
              t('common:core.chat.Mark'),
              <MyIcon
                {...iconStyle}
                name={'core/app/markLight'}
                _hover={{ color: isFooter ? 'primary.600' : '#67c13b' }}
                onClick={onMark}
              />
            )}
          {chat.obj === ChatRoleEnum.AI && (
            <>
              {/* 日志模式下，始终展示赞/踩 */}
              {isLogMode ? (
                <>
                  {!!chat.userGoodFeedback && (
                    <Box position={'relative'}>
                      <MyIcon
                        {...iconStyle}
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
                        {...iconStyle}
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
                      {...iconStyle}
                      {...(!!chat.userGoodFeedback
                        ? activeFeedbackStyle
                        : {
                            _hover: { color: 'primary.600' }
                          })}
                      borderRight={isFooter ? undefined : !onAddUserDislike ? 'none' : 'base'}
                      borderRightRadius={isFooter ? undefined : !onAddUserDislike ? 'sm' : 'none'}
                      name={'core/chat/feedback/goodLight'}
                      onClick={onAddUserLike}
                    />
                  )}
                  {!!onAddUserDislike && (
                    <MyIcon
                      {...iconStyle}
                      {...(!!chat.userBadFeedback
                        ? activeBadFeedbackStyle
                        : {
                            _hover: { color: 'primary.600' }
                          })}
                      borderRight={isFooter ? undefined : 'none'}
                      borderRightRadius={isFooter ? undefined : 'sm'}
                      name={'core/chat/feedback/badLight'}
                      onClick={onAddUserDislike}
                    />
                  )}
                </>
              )}
            </>
          )}
        </Flex>

        {onToggleFeedbackReadStatus &&
          chat.obj === ChatRoleEnum.AI &&
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
    </>
  );
};

export default React.memo(ChatController);
