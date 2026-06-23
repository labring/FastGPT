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
import LikeFeedbackButton from './LikeFeedbackButton';

export type ChatControllerProps = {
  isLastChild: boolean;
  chat: ChatSiteItemType;
  showVoiceIcon?: boolean;
  onRetry?: () => void;
  onDelete?: () => void;
  onMark?: () => void;
  onAddUserLike?: () => void;
  onAddUserDislike?: () => void;
  likeFeedbackEffectTrigger?: number;
  onToggleFeedbackReadStatus?: () => void;
  variant?: 'panel' | 'footer';
  disableFooterHoverTranslate?: boolean;
  footerRunDetailPosition?: 'default' | 'afterCopy';
  footerAfterCopySlot?: React.ReactNode;
  feedbackUserName?: string;
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
  transition: 'color 180ms ease, transform 180ms ease, filter 180ms ease',
  _hover: { color: 'primary.600', transform: 'translateY(-1px)' }
};

const ChatController = ({
  chat,
  showVoiceIcon,
  onMark,
  onRetry,
  onDelete,
  onAddUserDislike,
  onAddUserLike,
  likeFeedbackEffectTrigger,
  onToggleFeedbackReadStatus,
  variant = 'panel',
  disableFooterHoverTranslate = false,
  footerAfterCopySlot
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
  const renderTooltip = (label: string, children: React.ReactNode) => (
    <MyTooltip label={label}>{children}</MyTooltip>
  );
  const getIconHoverStyle = (color: string) => ({
    color,
    ...(isFooter && !disableFooterHoverTranslate ? { transform: 'translateY(-1px)' } : {})
  });
  const iconStyle = isFooter
    ? {
        ...footerIconStyle,
        _hover: getIconHoverStyle('primary.600')
      }
    : controlIconStyle;
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
  const showLogFeedbackAction =
    isLogMode &&
    chat.obj === ChatRoleEnum.AI &&
    (!!chat.userGoodFeedback || !!chat.userBadFeedback);
  const unreadFeedbackBadge = !chat.isFeedbackRead ? (
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
  ) : null;

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
              _hover={getIconHoverStyle('primary.600')}
              onClick={() => copyData(chatText)}
            />
          )}
          {isFooter && footerAfterCopySlot}
          {!!onDelete && !isChatting && chatType !== 'log' && (
            <>
              {onRetry &&
                renderTooltip(
                  t('common:core.chat.retry'),
                  <MyIcon
                    {...iconStyle}
                    name={'common/retryLight'}
                    _hover={getIconHoverStyle(isFooter ? 'primary.600' : 'green.500')}
                    onClick={onRetry}
                  />
                )}
              {renderTooltip(
                t('common:Delete'),
                <MyIcon
                  {...iconStyle}
                  name={'delete'}
                  _hover={getIconHoverStyle(isFooter ? 'primary.600' : 'red.600')}
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
                  _hover={getIconHoverStyle(isFooter ? 'primary.600' : '#E74694')}
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
                _hover={getIconHoverStyle(isFooter ? 'primary.600' : '#67c13b')}
                onClick={onMark}
              />
            )}
          {showLogFeedbackAction && (
            <Flex alignItems={'center'} gap={4}>
              <Flex alignItems={'center'} gap={'4px'}>
                {!!chat.userGoodFeedback && (
                  <MyTooltip label={t('chat:feedback_helpful')}>
                    <Box position={'relative'}>
                      <MyIcon
                        {...iconStyle}
                        name={'core/chat/feedback/goodLight'}
                        color={'primary.600'}
                        cursor={'default'}
                        pointerEvents={'none'}
                        _hover={{ color: 'primary.600' }}
                      />
                      {unreadFeedbackBadge}
                    </Box>
                  </MyTooltip>
                )}

                {!!chat.userBadFeedback && (
                  <MyTooltip label={t('chat:feedback_unhelpful')}>
                    <Box position={'relative'}>
                      <MyIcon
                        {...iconStyle}
                        name={'core/chat/feedback/badLight'}
                        color={'primary.600'}
                        cursor={'default'}
                        pointerEvents={'none'}
                        _hover={{ color: 'primary.600' }}
                      />
                      {unreadFeedbackBadge}
                    </Box>
                  </MyTooltip>
                )}
              </Flex>

              {onToggleFeedbackReadStatus &&
                (chat.isFeedbackRead ? (
                  <Button
                    size={'xs'}
                    variant={'unstyled'}
                    display={'inline-flex'}
                    alignItems={'center'}
                    justifyContent={'center'}
                    px={2}
                    fontSize={'11px'}
                    h={'22px'}
                    color={'primary.600'}
                    borderRadius={'sm'}
                    _hover={{ bg: 'primary.50' }}
                    isLoading={isLoadingOnToggleFeedbackReadStatus}
                    onClick={requestOnToggleFeedbackReadStatus}
                  >
                    {t('chat:log.feedback.read')}
                  </Button>
                ) : (
                  <Button
                    size={'xs'}
                    variant={'outline'}
                    color={'myGray.600'}
                    fontSize={'11px'}
                    h={'22px'}
                    isLoading={isLoadingOnToggleFeedbackReadStatus}
                    onClick={requestOnToggleFeedbackReadStatus}
                  >
                    {t('chat:log.feedback.mark_as_read')}
                  </Button>
                ))}
            </Flex>
          )}
          {chat.obj === ChatRoleEnum.AI && !isLogMode && (
            <>
              {!!onAddUserLike && (
                <MyTooltip label={t('chat:feedback_helpful')}>
                  {isFooter ? (
                    <LikeFeedbackButton
                      {...iconStyle}
                      isActive={!!chat.userGoodFeedback}
                      effectTrigger={likeFeedbackEffectTrigger}
                      disableHoverTranslate={disableFooterHoverTranslate}
                      onClick={onAddUserLike}
                    />
                  ) : (
                    <MyIcon
                      {...iconStyle}
                      {...(!!chat.userGoodFeedback
                        ? activeFeedbackStyle
                        : {
                            _hover: getIconHoverStyle('primary.600')
                          })}
                      borderRight={!onAddUserDislike ? 'none' : 'base'}
                      borderRightRadius={!onAddUserDislike ? 'sm' : 'none'}
                      name={'core/chat/feedback/goodLight'}
                      onClick={onAddUserLike}
                    />
                  )}
                </MyTooltip>
              )}
              {!!onAddUserDislike && (
                <MyTooltip label={t('chat:feedback_unhelpful')}>
                  <MyIcon
                    {...iconStyle}
                    {...(!!chat.userBadFeedback
                      ? activeBadFeedbackStyle
                      : {
                          _hover: getIconHoverStyle('primary.600')
                        })}
                    borderRight={isFooter ? undefined : 'none'}
                    borderRightRadius={isFooter ? undefined : 'sm'}
                    name={'core/chat/feedback/badLight'}
                    onClick={onAddUserDislike}
                  />
                </MyTooltip>
              )}
            </>
          )}
        </Flex>
      </Flex>
    </>
  );
};

export default React.memo(ChatController);
