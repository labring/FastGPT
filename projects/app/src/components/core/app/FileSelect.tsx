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
  type BoxProps,
  Checkbox
} from '@chakra-ui/react';
import React, { useMemo } from 'react';
import { useTranslation } from 'next-i18next';
import type { AppFileSelectConfigType } from '@fastgpt/global/core/app/type.d';
import MyModal from '@fastgpt/web/components/common/MyModal';
import MySlider from '@/components/Slider';
import ChatFunctionTip from './Tip';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import { useMount } from 'ahooks';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import MyTag from '@fastgpt/web/components/common/Tag/index';
import MyDivider from '@fastgpt/web/components/common/MyDivider';
import { defaultAppSelectFileConfig } from '@fastgpt/global/core/app/constants';

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
          {value.canSelectFile && feConfigs.showCustomPdfParse && (
            <>
              <HStack justifyContent={'end'} spacing={1} mt={2}>
                <Checkbox
                  isChecked={value.customPdfParse}
                  onChange={(e) => {
                    onChange({
                      ...value,
                      customPdfParse: e.target.checked
                    });
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
              <MyDivider my={2} />
            </>
          )}
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
            {t('common:Confirm')}
          </Button>
        </ModalFooter>
      </MyModal>
    </Flex>
  );
};

export default FileSelect;
