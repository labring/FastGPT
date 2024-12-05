import { useCopyData } from '@/web/common/hooks/useCopyData';
import { Flex, FlexProps, css, useTheme } from '@chakra-ui/react';
import { ChatSiteItemType } from '@fastgpt/global/core/chat/type';
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

export type ChatControllerProps = {
  isLastChild: boolean;
  chat: ChatSiteItemType;
  showVoiceIcon?: boolean;
  onRetry?: () => void;
  onDelete?: () => void;
  onMark?: () => void;
  onReadUserDislike?: () => void;
  onCloseUserLike?: () => void;
  onAddUserLike?: () => void;
  onAddUserDislike?: () => void;
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
  onReadUserDislike,
  onCloseUserLike,
  onMark,
  onRetry,
  onDelete,
  onAddUserDislike,
  onAddUserLike
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

  return (
    <Flex
      {...controlContainerStyle}
      borderRadius={'sm'}
      overflow={'hidden'}
      border={'base'}
      // 最后一个子元素，没有border
      css={css({
        '& > *:last-child, & > *:last-child svg': {
          borderRight: 'none',
          borderRadius: 'md'
        }
      })}
    >
      <MyTooltip label={t('common:common.Copy')}>
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
          <MyTooltip label={t('common:common.Delete')}>
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
              <MyTooltip label={t('common:common.Loading')}>
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
          {!!onCloseUserLike && chat.userGoodFeedback && (
            <MyTooltip label={t('common:core.chat.feedback.Close User Like')}>
              <MyIcon
                {...controlIconStyle}
                color={'white'}
                bg={'green.500'}
                fontWeight={'bold'}
                name={'core/chat/feedback/goodLight'}
                onClick={onCloseUserLike}
              />
            </MyTooltip>
          )}
          {!!onReadUserDislike && chat.userBadFeedback && (
            <MyTooltip label={t('common:core.chat.feedback.Read User dislike')}>
              <MyIcon
                {...controlIconStyle}
                color={'white'}
                bg={'#FC9663'}
                fontWeight={'bold'}
                name={'core/chat/feedback/badLight'}
                onClick={onReadUserDislike}
              />
            </MyTooltip>
          )}
          {!!onAddUserLike && (
            <MyIcon
              {...controlIconStyle}
              {...(!!chat.userGoodFeedback
                ? {
                    color: 'white',
                    bg: 'green.500',
                    fontWeight: 'bold'
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
                    bg: '#FC9663',
                    fontWeight: 'bold',
                    onClick: onAddUserDislike
                  }
                : {
                    _hover: { color: '#FB7C3C' },
                    onClick: onAddUserDislike
                  })}
              name={'core/chat/feedback/badLight'}
            />
          )}
        </>
      )}
    </Flex>
  );
};

export default React.memo(ChatController);
