import { useCopyData } from '@fastgpt/web/hooks/useCopyData';
import { Flex, type FlexProps, Box, Button } from '@chakra-ui/react';
import { type ChatSiteItemType } from '@fastgpt/global/core/chat/type';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import React, { useMemo } from 'react';
import { useTranslation } from 'next-i18next';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { formatChatValue2InputType } from '../utils';
import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import { ChatBoxContext } from '../Provider';
import { useContextSelector } from 'use-context-selector';
import MyImage from '@fastgpt/web/components/common/Image/MyImage';
import { ChatRecordContext } from '@/web/core/chat/context/chatRecordContext';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
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
  onToggleFeedbackContent
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

  const {
    runAsync: requestOnToggleFeedbackReadStatus,
    loading: isLoadingOnToggleFeedbackReadStatus
  } = useRequest2(async () => onToggleFeedbackReadStatus?.(), {
    manual: true,
    onSuccess: () => {
      eventBus.emit(EventNameEnum.refreshFeedback);
    }
  });

  return (
    <>
      <Flex alignItems={'center'} gap={2}>
        <Flex
          {...controlContainerStyle}
          borderRadius={'sm'}
          border={'base'}
          alignItems={'center'}
          sx={{
            '& > :first-child svg': {
              borderTopLeftRadius: 'sm',
              borderBottomLeftRadius: 'sm'
            },
            '& > :last-child svg': {
              borderRight: 'none',
              borderTopRightRadius: 'sm',
              borderBottomRightRadius: 'sm'
            }
          }}
        >
          <MyTooltip label={t('common:Copy')}>
            <MyIcon
              {...controlIconStyle}
              name={'copy'}
              _hover={{ color: 'primary.600' }}
              onClick={() => copyData(chatText)}
            />
          </MyTooltip>
          {!!onDelete && !isChatting && chatType !== 'log' && (
            <>
              {onRetry && (
                <MyTooltip label={t('common:core.chat.retry')}>
                  <MyIcon
                    {...controlIconStyle}
                    name={'common/retryLight'}
                    _hover={{ color: 'green.500' }}
                    onClick={onRetry}
                  />
                </MyTooltip>
              )}
              <MyTooltip label={t('common:Delete')}>
                <MyIcon
                  {...controlIconStyle}
                  name={'delete'}
                  _hover={{ color: 'red.600' }}
                  onClick={onDelete}
                />
              </MyTooltip>
            </>
          )}
          {showVoiceIcon &&
            hasAudio &&
            (() => {
              const isPlayingChat = chat.dataId === audioPlayingChatId;
              if (isPlayingChat && audioPlaying) {
                return (
                  <Flex alignItems={'center'}>
                    <MyTooltip label={t('common:core.chat.tts.Stop Speech')}>
                      <MyIcon
                        {...controlIconStyle}
                        borderRight={'none'}
                        name={'core/chat/stopSpeech'}
                        color={'#E74694'}
                        onClick={cancelAudio}
                      />
                    </MyTooltip>
                    <MyImage src="/icon/speaking.gif" w={'23px'} alt={''} borderRight={'base'} />
                  </Flex>
                );
              }
              if (isPlayingChat && audioLoading) {
                return (
                  <MyTooltip label={t('common:Loading')}>
                    <MyIcon {...controlIconStyle} name={'common/loading'} />
                  </MyTooltip>
                );
              }
              return (
                <MyTooltip label={t('common:core.app.TTS start')}>
                  <MyIcon
                    {...controlIconStyle}
                    name={'common/voiceLight'}
                    _hover={{ color: '#E74694' }}
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
                </MyTooltip>
              );
            })()}
          {!!onMark && (
            <MyTooltip label={t('common:core.chat.Mark')}>
              <MyIcon
                {...controlIconStyle}
                name={'core/app/markLight'}
                _hover={{ color: '#67c13b' }}
                onClick={onMark}
              />
            </MyTooltip>
          )}
          {chat.obj === ChatRoleEnum.AI && (
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
                      borderRight={!onAddUserDislike ? 'none' : 'base'}
                      borderRightRadius={!onAddUserDislike ? 'sm' : 'none'}
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
                      borderRight={'none'}
                      borderRightRadius={'sm'}
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
