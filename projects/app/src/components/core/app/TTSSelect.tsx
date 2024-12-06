import MyIcon from '@fastgpt/web/components/common/Icon';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { Box, Button, Flex, ModalBody, useDisclosure, Image } from '@chakra-ui/react';
import React, { useCallback, useMemo } from 'react';
import { useTranslation } from 'next-i18next';
import { TTSTypeEnum } from '@/web/core/app/constants';
import type { AppTTSConfigType } from '@fastgpt/global/core/app/type.d';
import { useAudioPlay } from '@/web/common/utils/voice';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import MyModal from '@fastgpt/web/components/common/MyModal';
import MySlider from '@/components/Slider';
import MySelect from '@fastgpt/web/components/common/MySelect';
import { defaultTTSConfig } from '@fastgpt/global/core/app/constants';
import ChatFunctionTip from './Tip';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import MyImage from '@fastgpt/web/components/common/Image/MyImage';
import { useContextSelector } from 'use-context-selector';
import { AppContext } from '@/pages/app/detail/components/context';

const TTSSelect = ({
  value = defaultTTSConfig,
  onChange
}: {
  value?: AppTTSConfigType;
  onChange: (e: AppTTSConfigType) => void;
}) => {
  const { t } = useTranslation();
  const { audioSpeechModelList } = useSystemStore();
  const { isOpen, onOpen, onClose } = useDisclosure();

  const appId = useContextSelector(AppContext, (v) => v.appId);

  const list = useMemo(
    () => [
      { label: t('common:core.app.tts.Close'), value: TTSTypeEnum.none },
      { label: t('common:core.app.tts.Web'), value: TTSTypeEnum.web },
      ...audioSpeechModelList.map((item) => item?.voices || []).flat()
    ],
    [audioSpeechModelList, t]
  );

  const formatValue = useMemo(() => {
    if (!value || !value.type) {
      return TTSTypeEnum.none;
    }
    if (value.type === TTSTypeEnum.none || value.type === TTSTypeEnum.web) {
      return value.type;
    }
    return value.voice;
  }, [value]);
  const formLabel = useMemo(
    () => list.find((item) => item.value === formatValue)?.label || t('common:common.UnKnow'),
    [formatValue, list, t]
  );

  const { playAudioByText, cancelAudio, audioLoading, audioPlaying } = useAudioPlay({
    appId,
    ttsConfig: value
  });

  const onclickChange = useCallback(
    (e: string) => {
      if (e === TTSTypeEnum.none || e === TTSTypeEnum.web) {
        onChange({ type: e as `${TTSTypeEnum}` });
      } else {
        const audioModel = audioSpeechModelList.find((item) =>
          item.voices?.find((voice) => voice.value === e)
        );
        if (!audioModel) {
          return;
        }
        onChange({
          ...value,
          type: TTSTypeEnum.model,
          model: audioModel.model,
          voice: e
        });
      }
    },
    [audioSpeechModelList, onChange, value]
  );

  const onCloseTTSModal = useCallback(() => {
    cancelAudio();
    onClose();
  }, [cancelAudio, onClose]);

  return (
    <Flex alignItems={'center'}>
      <MyIcon name={'core/app/simpleMode/tts'} mr={2} w={'20px'} />
      <FormLabel color={'myGray.600'}>{t('common:core.app.TTS')}</FormLabel>
      <ChatFunctionTip type={'tts'} />
      <Box flex={1} />
      <MyTooltip label={t('common:core.app.Select TTS')}>
        <Button
          variant={'transparentBase'}
          iconSpacing={1}
          size={'sm'}
          mr={'-5px'}
          onClick={onOpen}
          color={'myGray.600'}
        >
          {formLabel}
        </Button>
      </MyTooltip>
      <MyModal
        iconSrc="core/app/simpleMode/tts"
        title={t('common:core.app.TTS')}
        isOpen={isOpen}
        onClose={onCloseTTSModal}
        w={'500px'}
      >
        <ModalBody px={[5, 16]} py={[4, 8]}>
          <Flex justifyContent={'space-between'} alignItems={'center'}>
            <FormLabel>{t('common:core.app.tts.Speech model')}</FormLabel>
            <MySelect w={'220px'} value={formatValue} list={list} onchange={onclickChange} />
          </Flex>
          <Flex mt={8} justifyContent={'space-between'}>
            <FormLabel>{t('common:core.app.tts.Speech speed')}</FormLabel>
            <MySlider
              markList={[
                { label: '0.3', value: 0.3 },
                { label: '2', value: 2 }
              ]}
              width={'220px'}
              min={0.3}
              max={2}
              step={0.1}
              value={value.speed || 1}
              onChange={(e) => {
                onChange({
                  ...value,
                  speed: e
                });
              }}
            />
          </Flex>
          {formatValue !== TTSTypeEnum.none && (
            <Flex mt={10} justifyContent={'end'}>
              {audioPlaying ? (
                <Flex>
                  <MyImage src="/icon/speaking.gif" w={'24px'} alt={''} />
                  <Button
                    ml={2}
                    variant={'grayBase'}
                    color={'primary.600'}
                    isLoading={audioLoading}
                    leftIcon={<MyIcon name={'core/chat/stopSpeech'} w={'16px'} />}
                    onClick={cancelAudio}
                  >
                    {t('common:core.chat.tts.Stop Speech')}
                  </Button>
                </Flex>
              ) : (
                <Button
                  isLoading={audioLoading}
                  leftIcon={<MyIcon name={'core/app/headphones'} w={'16px'} />}
                  onClick={() => {
                    playAudioByText({
                      text: t('common:core.app.tts.Test Listen Text')
                    });
                  }}
                >
                  {t('common:core.app.tts.Test Listen')}
                </Button>
              )}
            </Flex>
          )}
        </ModalBody>
      </MyModal>
    </Flex>
  );
};

export default TTSSelect;
