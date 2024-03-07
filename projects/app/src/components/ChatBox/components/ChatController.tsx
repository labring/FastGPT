import { useCopyData } from '@/web/common/hooks/useCopyData';
import { useAudioPlay } from '@/web/common/utils/voice';
import { Flex, FlexProps, Image, useTheme } from '@chakra-ui/react';
import { ChatSiteItemType } from '@fastgpt/global/core/chat/type';
import { AppTTSConfigType } from '@fastgpt/global/core/module/type';
import { OutLinkChatAuthProps } from '@fastgpt/global/support/permission/chat';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import React from 'react';
import { useTranslation } from 'react-i18next';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { formatChatValue2InputType } from '../utils';

const ChatController = ({
  isChatting,
  chat,
  setChatHistories,
  display,
  showVoiceIcon,
  ttsConfig,
  onReadUserDislike,
  onCloseUserLike,
  onMark,
  onRetry,
  onDelete,
  onAddUserDislike,
  onAddUserLike,
  ml,
  mr,
  shareId,
  outLinkUid,
  teamId,
  teamToken
}: OutLinkChatAuthProps & {
  isChatting: boolean;
  chat: ChatSiteItemType;
  setChatHistories?: React.Dispatch<React.SetStateAction<ChatSiteItemType[]>>;
  showVoiceIcon?: boolean;
  ttsConfig?: AppTTSConfigType;
  onRetry?: () => void;
  onDelete?: () => void;
  onMark?: () => void;
  onReadUserDislike?: () => void;
  onCloseUserLike?: () => void;
  onAddUserLike?: () => void;
  onAddUserDislike?: () => void;
} & FlexProps) => {
  const theme = useTheme();
  const { t } = useTranslation();
  const { copyData } = useCopyData();
  const { audioLoading, audioPlaying, hasAudio, playAudio, cancelAudio } = useAudioPlay({
    ttsConfig,
    shareId,
    outLinkUid,
    teamId,
    teamToken
  });
  const controlIconStyle = {
    w: '14px',
    cursor: 'pointer',
    p: 1,
    bg: 'white',
    borderRadius: 'md',
    boxShadow: '0 0 5px rgba(0,0,0,0.1)',
    border: theme.borders.base,
    mr: 3
  };
  const controlContainerStyle = {
    className: 'control',
    color: 'myGray.400',
    display: 'flex',
    pl: 1
  };

  return (
    <Flex {...controlContainerStyle} ml={ml} mr={mr} display={display}>
      <MyTooltip label={t('common.Copy')}>
        <MyIcon
          {...controlIconStyle}
          name={'copy'}
          _hover={{ color: 'primary.600' }}
          onClick={() => copyData(formatChatValue2InputType(chat.value).text || '')}
        />
      </MyTooltip>
      {!!onDelete && !isChatting && (
        <>
          {onRetry && (
            <MyTooltip label={t('core.chat.retry')}>
              <MyIcon
                {...controlIconStyle}
                name={'common/retryLight'}
                _hover={{ color: 'green.500' }}
                onClick={onRetry}
              />
            </MyTooltip>
          )}
          <MyTooltip label={t('common.Delete')}>
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
        (audioLoading ? (
          <MyTooltip label={t('common.Loading')}>
            <MyIcon {...controlIconStyle} name={'common/loading'} />
          </MyTooltip>
        ) : audioPlaying ? (
          <Flex alignItems={'center'} mr={2}>
            <MyTooltip label={t('core.chat.tts.Stop Speech')}>
              <MyIcon
                {...controlIconStyle}
                mr={1}
                name={'core/chat/stopSpeech'}
                color={'#E74694'}
                onClick={() => cancelAudio()}
              />
            </MyTooltip>
            <Image src="/icon/speaking.gif" w={'23px'} alt={''} />
          </Flex>
        ) : (
          <MyTooltip label={t('core.app.TTS')}>
            <MyIcon
              {...controlIconStyle}
              name={'common/voiceLight'}
              _hover={{ color: '#E74694' }}
              onClick={async () => {
                const response = await playAudio({
                  buffer: chat.ttsBuffer,
                  chatItemId: chat.dataId,
                  text: formatChatValue2InputType(chat.value).text || ''
                });

                if (!setChatHistories || !response.buffer) return;
                setChatHistories((state) =>
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
        ))}
      {!!onMark && (
        <MyTooltip label={t('core.chat.Mark')}>
          <MyIcon
            {...controlIconStyle}
            name={'core/app/markLight'}
            _hover={{ color: '#67c13b' }}
            onClick={onMark}
          />
        </MyTooltip>
      )}
      {!!onCloseUserLike && chat.userGoodFeedback && (
        <MyTooltip label={t('core.chat.feedback.Close User Like')}>
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
        <MyTooltip label={t('core.chat.feedback.Read User dislike')}>
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
    </Flex>
  );
};

export default React.memo(ChatController);
