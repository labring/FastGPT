import MyIcon from '@fastgpt/web/components/common/Icon';
import MyTooltip from '@/components/MyTooltip';
import { QuestionOutlineIcon } from '@chakra-ui/icons';
import { Box, Button, Flex, ModalBody, useDisclosure, Image } from '@chakra-ui/react';
import React, { useCallback, useMemo } from 'react';
import { useTranslation } from 'next-i18next';
import MySelect from '@/components/Select';
import { TTSTypeEnum } from '@/constants/app';
import type { AppTTSConfigType } from '@fastgpt/global/core/module/type.d';
import { useAudioPlay } from '@/web/common/utils/voice';
import { audioSpeechModelList } from '@/web/common/system/staticData';
import MyModal from '@/components/MyModal';
import MySlider from '@/components/Slider';

const TTSSelect = ({
  value,
  onChange
}: {
  value: AppTTSConfigType;
  onChange: (e: AppTTSConfigType) => void;
}) => {
  const { t } = useTranslation();
  const { isOpen, onOpen, onClose } = useDisclosure();

  const list = useMemo(
    () => [
      { label: t('core.app.tts.Close'), value: TTSTypeEnum.none },
      { label: t('core.app.tts.Web'), value: TTSTypeEnum.web },
      ...audioSpeechModelList.map((item) => item?.voices || []).flat()
    ],
    [t]
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
    () => list.find((item) => item.value === formatValue)?.label || t('common.UnKnow'),
    [formatValue, list, t]
  );

  const { playAudio, cancelAudio, audioLoading, audioPlaying } = useAudioPlay({ ttsConfig: value });

  const onclickChange = useCallback(
    (e: string) => {
      if (e === TTSTypeEnum.none || e === TTSTypeEnum.web) {
        onChange({ type: e as `${TTSTypeEnum}` });
      } else {
        const audioModel = audioSpeechModelList.find(
          (item) => item.voices?.find((voice) => voice.value === e)
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
    [onChange, value]
  );

  return (
    <Flex alignItems={'center'}>
      <MyIcon name={'core/app/tts'} mr={2} w={'16px'} />
      <Box>{t('core.app.TTS')}</Box>
      <MyTooltip label={t('core.app.TTS Tip')} forceShow>
        <QuestionOutlineIcon display={['none', 'inline']} ml={1} />
      </MyTooltip>
      <Box flex={1} />
      <MyTooltip label={t('core.app.Select TTS')}>
        <Box
          cursor={'pointer'}
          _hover={{ bg: 'myGray.100' }}
          py={2}
          px={3}
          borderRadius={'md'}
          onClick={onOpen}
          color={'myGray.600'}
        >
          {formLabel}
        </Box>
      </MyTooltip>
      <MyModal
        title={
          <>
            <MyIcon name={'core/app/tts'} mr={2} w={'20px'} />
            {t('core.app.TTS')}
          </>
        }
        isOpen={isOpen}
        onClose={onClose}
        w={'500px'}
      >
        <ModalBody px={[5, 16]} py={[4, 8]}>
          <Flex justifyContent={'space-between'} alignItems={'center'}>
            {t('core.app.tts.Speech model')}
            <MySelect w={'220px'} value={formatValue} list={list} onchange={onclickChange} />
          </Flex>
          <Flex mt={8} justifyContent={'space-between'} alignItems={'center'}>
            {t('core.app.tts.Speech speed')}
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
                  <Image src="/icon/speaking.gif" w={'24px'} alt={''} />
                  <Button
                    ml={2}
                    variant={'grayBase'}
                    color={'primary.600'}
                    isLoading={audioLoading}
                    leftIcon={<MyIcon name={'core/chat/stopSpeech'} w={'16px'} />}
                    onClick={() => {
                      cancelAudio();
                    }}
                  >
                    {t('core.chat.tts.Stop Speech')}
                  </Button>
                </Flex>
              ) : (
                <Button
                  isLoading={audioLoading}
                  leftIcon={<MyIcon name={'core/app/headphones'} w={'16px'} />}
                  onClick={() => {
                    playAudio({
                      text: t('core.app.tts.Test Listen Text')
                    });
                  }}
                >
                  {t('core.app.tts.Test Listen')}
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
