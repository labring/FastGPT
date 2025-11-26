import MyIcon from '@fastgpt/web/components/common/Icon';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import {
  Box,
  Button,
  Flex,
  ModalBody,
  useDisclosure,
  HStack,
  ModalFooter,
  type BoxProps,
  Checkbox,
  VStack
} from '@chakra-ui/react';
import React, { useState } from 'react';
import { useTranslation } from 'next-i18next';
import type { AppFileSelectConfigType } from '@fastgpt/global/core/app/type.d';
import MyModal from '@fastgpt/web/components/common/MyModal';
import ChatFunctionTip from './Tip';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import { useMount } from 'ahooks';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import MyTag from '@fastgpt/web/components/common/Tag/index';
import { defaultAppSelectFileConfig } from '@fastgpt/global/core/app/constants';
import InputSlider from '@fastgpt/web/components/common/MySlider/InputSlider';
import { FileTypeSelectorPanel } from '@fastgpt/web/components/core/app/FileTypeSelector';

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

  const [localValue, setLocalValue] = useState(value);

  const canUploadFile =
    value.canSelectFile ||
    value.canSelectImg ||
    value.canSelectVideo ||
    value.canSelectAudio ||
    value.canSelectCustomFileExtension;
  const formLabel = canUploadFile
    ? t('common:core.app.whisper.Open')
    : t('common:core.app.whisper.Close');

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
          onClick={() => {
            setLocalValue(value);
            onOpen();
          }}
        >
          {formLabel}
        </Button>
      </MyTooltip>
      <MyModal
        iconSrc="core/app/simpleMode/file"
        title={t('app:file_upload')}
        isOpen={isOpen}
        onClose={onClose}
        w={'500px'}
      >
        <ModalBody>
          <Box>
            <HStack spacing={1}>
              <FormLabel>{t('app:upload_file_max_amount')}</FormLabel>
              <QuestionTip label={t('app:upload_file_max_amount_tip')} />
            </HStack>

            <Box mt={2} alignItems={'center'} gap={5}>
              <InputSlider
                min={1}
                max={maxSelectFiles}
                step={1}
                value={localValue.maxFiles ?? 5}
                onChange={(e) => {
                  setLocalValue((state) => ({
                    ...state,
                    maxFiles: e
                  }));
                }}
              />
            </Box>
          </Box>

          <VStack spacing={2} alignItems={'flex-start'} mt={6}>
            <FormLabel>{t('app:upload_file_extension_types')}</FormLabel>

            <VStack
              w="full"
              spacing={3}
              alignItems={'flex-start'}
              border="1px solid"
              borderColor="myGray.200"
              borderRadius="md"
              p={4}
            >
              <FileTypeSelectorPanel value={localValue} onChange={setLocalValue} />
            </VStack>
          </VStack>

          {localValue.canSelectFile && feConfigs?.showCustomPdfParse && (
            <HStack justifyContent={'flex-start'} spacing={1} mt={2}>
              <Checkbox
                isChecked={localValue.customPdfParse}
                onChange={(e) => {
                  setLocalValue((state) => ({
                    ...state,
                    customPdfParse: e.target.checked
                  }));
                }}
              >
                <FormLabel>{t('app:pdf_enhance_parse')}</FormLabel>
              </Checkbox>
              <QuestionTip label={t('app:pdf_enhance_parse_tips')} />
              {feConfigs?.show_pay && (
                <MyTag
                  type={'borderSolid'}
                  borderColor={'myGray.200'}
                  bg={'myGray.100'}
                  color={'primary.600'}
                  py={1.5}
                  borderRadius={'md'}
                  px={3}
                  whiteSpace={'wrap'}
                  ml={1}
                >
                  {t('app:pdf_enhance_parse_price', {
                    price: feConfigs.customPdfParsePrice || 0
                  })}
                </MyTag>
              )}
            </HStack>
          )}
        </ModalBody>
        <ModalFooter>
          <Button
            onClick={() => {
              onChange(localValue);
              onClose();
            }}
            px={8}
          >
            {t('common:Confirm')}
          </Button>
        </ModalFooter>
      </MyModal>
    </Flex>
  );
};

export default FileSelect;
