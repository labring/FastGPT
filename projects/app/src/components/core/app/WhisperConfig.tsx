import MyIcon from '@fastgpt/web/components/common/Icon';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { Box, Button, Flex, ModalBody, useDisclosure, Switch } from '@chakra-ui/react';
import React, { useMemo } from 'react';
import { useTranslation } from 'next-i18next';
import type { AppWhisperConfigType } from '@fastgpt/global/core/app/type.d';
import MyModal from '@fastgpt/web/components/common/MyModal';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import { defaultWhisperConfig } from '@fastgpt/global/core/app/constants';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';

const WhisperConfig = ({
  isOpenAudio,
  value = defaultWhisperConfig,
  onChange
}: {
  isOpenAudio: boolean;
  value?: AppWhisperConfigType;
  onChange: (e: AppWhisperConfigType) => void;
}) => {
  const { t } = useTranslation();
  const { isOpen, onOpen, onClose } = useDisclosure();

  const isOpenWhisper = value.open;
  const isAutoSend = value.autoSend;

  const formLabel = useMemo(() => {
    if (!isOpenWhisper) {
      return t('common:core.app.whisper.Close');
    }
    return t('common:core.app.whisper.Open');
  }, [t, isOpenWhisper]);

  return (
    <Flex alignItems={'center'}>
      <MyIcon name={'core/app/simpleMode/whisper'} mr={2} w={'20px'} />
      <FormLabel color={'myGray.600'}>{t('common:core.app.Whisper')}</FormLabel>
      <Box flex={1} />
      <MyTooltip label={t('common:core.app.Config whisper')}>
        <Button
          variant={'transparentBase'}
          iconSpacing={1}
          size={'sm'}
          mr={'-5px'}
          color={'myGray.600'}
          onClick={onOpen}
        >
          {formLabel}
        </Button>
      </MyTooltip>
      <MyModal
        title={t('common:core.app.Whisper config')}
        iconSrc="core/app/simpleMode/whisper"
        isOpen={isOpen}
        onClose={onClose}
      >
        <ModalBody px={[5, 16]} py={[4, 8]}>
          <Flex justifyContent={'space-between'} alignItems={'center'}>
            <FormLabel>{t('common:core.app.whisper.Switch')}</FormLabel>
            <Switch
              isChecked={isOpenWhisper}
              onChange={(e) => {
                onChange({
                  ...value,
                  open: e.target.checked
                });
              }}
            />
          </Flex>
          {isOpenWhisper && (
            <Flex mt={8} alignItems={'center'}>
              <FormLabel>{t('common:core.app.whisper.Auto send')}</FormLabel>
              <QuestionTip label={t('common:core.app.whisper.Auto send tip')} />
              <Box flex={'1 0 0'} />
              <Switch
                isChecked={value.autoSend}
                onChange={(e) => {
                  onChange({
                    ...value,
                    autoSend: e.target.checked
                  });
                }}
              />
            </Flex>
          )}
          {isOpenWhisper && isAutoSend && (
            <>
              <Flex mt={8} alignItems={'center'}>
                <FormLabel>{t('common:core.app.whisper.Auto tts response')}</FormLabel>
                <QuestionTip label={t('common:core.app.whisper.Auto tts response tip')} />
                <Box flex={'1 0 0'} />
                <Switch
                  isChecked={value.autoTTSResponse}
                  onChange={(e) => {
                    onChange({
                      ...value,
                      autoTTSResponse: e.target.checked
                    });
                  }}
                />
              </Flex>
              {!isOpenAudio && (
                <Box mt={1} color={'myGray.600'} fontSize={'sm'}>
                  {t('common:core.app.whisper.Not tts tip')}
                </Box>
              )}
            </>
          )}
        </ModalBody>
      </MyModal>
    </Flex>
  );
};

export default React.memo(WhisperConfig);
