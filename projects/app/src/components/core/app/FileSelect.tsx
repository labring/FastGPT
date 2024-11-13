import MyIcon from '@fastgpt/web/components/common/Icon';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import {
  Box,
  Button,
  Flex,
  ModalBody,
  useDisclosure,
  HStack,
  Switch,
  ModalFooter,
  BoxProps
} from '@chakra-ui/react';
import React, { useMemo } from 'react';
import { useTranslation } from 'next-i18next';
import type { AppFileSelectConfigType } from '@fastgpt/global/core/app/type.d';
import MyModal from '@fastgpt/web/components/common/MyModal';
import MySlider from '@/components/Slider';
import { defaultAppSelectFileConfig } from '@fastgpt/global/core/app/constants';
import ChatFunctionTip from './Tip';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import { useMount } from 'ahooks';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';

const FileSelect = ({
  forbidVision = false,
  value = defaultAppSelectFileConfig,
  onChange,
  ...labelStyle
}: Omit<BoxProps, 'onChange'> & {
  forbidVision?: boolean;
  value?: AppFileSelectConfigType;
  onChange: (e: AppFileSelectConfigType) => void;
}) => {
  const { t } = useTranslation();
  const { feConfigs } = useSystemStore();
  const { isOpen, onOpen, onClose } = useDisclosure();
  const maxSelectFiles = Math.min(feConfigs?.uploadFileMaxAmount ?? 20, 30);

  const formLabel = useMemo(
    () =>
      value.canSelectFile || value.canSelectImg
        ? t('common:core.app.whisper.Open')
        : t('common:core.app.whisper.Close'),
    [t, value.canSelectFile, value.canSelectImg]
  );

  // Close select img switch when vision is forbidden
  useMount(() => {
    if (forbidVision) {
      onChange({
        ...value,
        canSelectImg: false
      });
    }
  });

  return (
    <Flex alignItems={'center'}>
      <MyIcon name={'core/app/simpleMode/file'} mr={2} w={'20px'} />
      <FormLabel color={'myGray.600'} {...labelStyle}>
        {t('app:file_upload')}
      </FormLabel>
      <ChatFunctionTip type={'file'} />
      <Box flex={1} />
      <MyTooltip label={t('app:config_file_upload')}>
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
        iconSrc="core/app/simpleMode/file"
        title={t('app:file_upload')}
        isOpen={isOpen}
        onClose={onClose}
      >
        <ModalBody>
          <HStack>
            <FormLabel flex={'1 0 0'}>{t('app:document_upload')}</FormLabel>
            <Switch
              isChecked={value.canSelectFile}
              onChange={(e) => {
                onChange({
                  ...value,
                  canSelectFile: e.target.checked
                });
              }}
            />
          </HStack>
          <HStack mt={6}>
            <FormLabel flex={'1 0 0'}>{t('app:image_upload')}</FormLabel>
            {forbidVision ? (
              <Box fontSize={'sm'} color={'myGray.500'}>
                {t('app:llm_not_support_vision')}
              </Box>
            ) : (
              <Switch
                isChecked={value.canSelectImg}
                onChange={(e) => {
                  onChange({
                    ...value,
                    canSelectImg: e.target.checked
                  });
                }}
              />
            )}
          </HStack>
          {!forbidVision && (
            <Flex mt={2} color={'myGray.500'}>
              <Box fontSize={'xs'}>{t('app:image_upload_tip')}</Box>
              <ChatFunctionTip type="visionModel" />
            </Flex>
          )}

          <Box mt={6}>
            <HStack spacing={1}>
              <FormLabel>{t('app:upload_file_max_amount')}</FormLabel>
              <QuestionTip label={t('app:upload_file_max_amount_tip')} />
            </HStack>

            <Box mt={5}>
              <MySlider
                markList={[
                  { label: '1', value: 1 },
                  { label: `${maxSelectFiles}`, value: maxSelectFiles }
                ]}
                width={'100%'}
                min={1}
                max={maxSelectFiles}
                step={1}
                value={value.maxFiles ?? 5}
                onChange={(e) => {
                  onChange({
                    ...value,
                    maxFiles: e
                  });
                }}
              />
            </Box>
          </Box>
        </ModalBody>
        <ModalFooter>
          <Button onClick={onClose} px={8}>
            {t('common:common.Confirm')}
          </Button>
        </ModalFooter>
      </MyModal>
    </Flex>
  );
};

export default FileSelect;
