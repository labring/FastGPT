import { Box, Button, Flex, useDisclosure, Switch } from '@chakra-ui/react';
import React from 'react';
import { useTranslation } from 'next-i18next';
import type { AppWhisperConfigType } from '@fastgpt/global/core/app/type';
import MyModal from '@fastgpt/web/components/v2/common/MyModal';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import { defaultWhisperConfig } from '@fastgpt/global/core/app/constants';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import AppConfigItem, { AppConfigItemAction } from './AppConfigItem';

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

  const formLabel = isOpenWhisper
    ? t('common:core.app.whisper.Open')
    : t('common:core.app.whisper.Close');

  return (
    <>
      <AppConfigItem
        icon={'core/app/simpleMode/whisper'}
        label={t('common:core.app.Whisper')}
        tip={<QuestionTip label={t('common:core.app.Config whisper')} ml={1} />}
        action={
          <AppConfigItemAction tooltip={t('common:core.app.Config whisper')} onClick={onOpen}>
            {formLabel}
          </AppConfigItemAction>
        }
      />
      <MyModal
        title={t('common:core.app.Whisper config')}
        isOpen={isOpen}
        onClose={onClose}
        isCentered
        footer={<Button onClick={onClose}>{t('common:Confirm')}</Button>}
      >
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
      </MyModal>
    </>
  );
};

export default React.memo(WhisperConfig);
