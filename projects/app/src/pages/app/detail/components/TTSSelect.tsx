import MyIcon from '@/components/Icon';
import MyTooltip from '@/components/MyTooltip';
import { QuestionOutlineIcon } from '@chakra-ui/icons';
import {
  Box,
  Button,
  Flex,
  Modal,
  ModalBody,
  ModalContent,
  ModalHeader,
  ModalOverlay,
  useDisclosure
} from '@chakra-ui/react';
import React, { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import MySelect from '@/components/Select';
import { TTSTypeEnum } from '@/constants/app';
import { Text2SpeechVoiceEnum, openaiTTSModel } from '@fastgpt/global/core/ai/speech/constant';
import { AppTTSConfigType } from '@/types/app';
import { useAudioPlay } from '@/web/common/utils/voice';
import { useLoading } from '@/web/common/hooks/useLoading';

const TTSSelect = ({
  value,
  onChange
}: {
  value: AppTTSConfigType;
  onChange: (e: AppTTSConfigType) => void;
}) => {
  const { t } = useTranslation();
  const { playAudio, audioLoading } = useAudioPlay({ ttsConfig: value });
  const { Loading } = useLoading();

  const formatValue = useMemo(() => {
    if (!value || !value.type) {
      return TTSTypeEnum.none;
    }
    if (value.type === TTSTypeEnum.none || value.type === TTSTypeEnum.web) {
      return value.type;
    }
    return value.voice;
  }, [value]);

  const { isOpen, onOpen, onClose } = useDisclosure();

  const onclickChange = useCallback(
    (e: string) => {
      if (e === TTSTypeEnum.none || e === TTSTypeEnum.web) {
        onChange({ type: e as `${TTSTypeEnum}` });
      } else {
        onChange({
          type: TTSTypeEnum.model,
          model: openaiTTSModel,
          voice: e as `${Text2SpeechVoiceEnum}`,
          speed: 1
        });
      }
    },
    [onChange]
  );

  return (
    <Flex alignItems={'center'}>
      <MyIcon name={'core/app/ttsFill'} mr={2} w={'16px'} />
      <Box>{t('core.app.TTS')}</Box>
      <MyTooltip label={t('core.app.TTS Tip')} forceShow>
        <QuestionOutlineIcon display={['none', 'inline']} ml={1} />
      </MyTooltip>
      <Box flex={1} />
      <Button variant={'boxBtn'} onClick={onOpen} color={'myGray.600'}>
        {formatValue}
      </Button>
      <Modal isOpen={isOpen} onClose={onClose} size={'xl'}>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader
            display={'flex'}
            alignItems={'center'}
            fontWeight={500}
            background={'#FBFBFC'}
            borderBottom={'1px solid #F4F6F8'}
            roundedTop={'lg'}
          >
            <MyIcon name={'core/app/tts'} mr={2} w={'20px'} />
            {t('core.app.TTS')}
          </ModalHeader>
          <ModalBody px={16}>
            <Flex justifyContent={'space-between'} alignItems={'center'} py={8}>
              {t('core.app.tts.Speech model')}
              <MySelect
                w={'200px'}
                border={'none'}
                bg={'#F3F4F6'}
                _hover={{ bg: '#EFF0F1' }}
                value={formatValue}
                list={[
                  { label: t('core.app.tts.Close'), value: TTSTypeEnum.none },
                  { label: t('core.app.tts.Web'), value: TTSTypeEnum.web },
                  { label: 'Alloy', value: Text2SpeechVoiceEnum.alloy },
                  { label: 'Echo', value: Text2SpeechVoiceEnum.echo },
                  { label: 'Fable', value: Text2SpeechVoiceEnum.fable },
                  { label: 'Onyx', value: Text2SpeechVoiceEnum.onyx },
                  { label: 'Nova', value: Text2SpeechVoiceEnum.nova },
                  { label: 'Shimmer', value: Text2SpeechVoiceEnum.shimmer }
                ]}
                onchange={onclickChange}
              />
            </Flex>
            {formatValue !== TTSTypeEnum.none && (
              <Flex mb={8} mt={2} justifyContent={'end'}>
                <Button
                  variant={'blue'}
                  onClick={() => {
                    playAudio({
                      text: t('core.app.tts.Test Listen Text')
                    });
                  }}
                >
                  <MyIcon name={'core/app/headphones'} mr={2} w={'16px'} />
                  {t('core.app.tts.Test Listen')}
                </Button>
              </Flex>
            )}
            <Loading loading={audioLoading} fixed={false} />
          </ModalBody>
        </ModalContent>
      </Modal>
    </Flex>
  );
};

export default TTSSelect;
