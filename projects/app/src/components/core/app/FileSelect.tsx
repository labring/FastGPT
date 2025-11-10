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
  VStack,
  Input
} from '@chakra-ui/react';
import React, { useState } from 'react';
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
import type { FileExtensionKeyType } from '@fastgpt/global/core/app/constants';
import {
  defaultAppSelectFileConfig,
  defaultFileExtensionTypes
} from '@fastgpt/global/core/app/constants';
import InputSlider from '@fastgpt/web/components/common/MySlider/InputSlider';
import { shadowLight } from '@fastgpt/web/styles/theme';

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
  const [isAddingCustomFileExtension, setIsAddingCustomFileExtension] = useState(false);
  const [customFileExtension, setCustomFileExtension] = useState('.');

  const canUploadFile =
    value.canSelectFile ||
    value.canSelectImg ||
    value.canSelectVideo ||
    value.canSelectAudio ||
    value.canSelectCustomFileExtension;
  const formLabel = canUploadFile
    ? t('common:core.app.whisper.Open')
    : t('common:core.app.whisper.Close');

  const handleCheckboxChange = (type: FileExtensionKeyType, checked: boolean) => {
    if (type === 'canSelectFile') {
      setLocalValue((state) => ({
        ...state,
        canSelectFile: checked
      }));
    } else if (type === 'canSelectImg') {
      setLocalValue((state) => ({
        ...state,
        canSelectImg: checked
      }));
    } else if (type === 'canSelectVideo') {
      setLocalValue((state) => ({
        ...state,
        canSelectVideo: checked
      }));
    } else if (type === 'canSelectAudio') {
      setLocalValue((state) => ({
        ...state,
        canSelectAudio: checked
      }));
    } else if (type === 'canSelectCustomFileExtension') {
      setLocalValue((state) => ({
        ...state,
        canSelectCustomFileExtension: checked
      }));
    }
  };

  const handleConfirmCustomFileExtension = () => {
    const exists = localValue?.customFileExtensionList?.includes(customFileExtension);
    if (customFileExtension !== '.' && !exists) {
      setLocalValue((state) => ({
        ...state,
        customFileExtensionList: [...(state.customFileExtensionList || []), customFileExtension]
      }));
      handleCheckboxChange('canSelectCustomFileExtension', true);
    }
    setCustomFileExtension('.');
    setIsAddingCustomFileExtension(false);
  };

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
              {Object.entries(defaultFileExtensionTypes).map(([type, exts]) =>
                type === 'canSelectCustomFileExtension' ? (
                  <VStack key={type} w="full" spacing={2} alignItems={'flex-start'}>
                    <Checkbox
                      w="full"
                      alignItems={'flex-start'}
                      cursor="pointer"
                      isChecked={localValue.canSelectCustomFileExtension}
                      onChange={(e) => {
                        handleCheckboxChange('canSelectCustomFileExtension', e.target.checked);
                      }}
                    >
                      <Box color={'myGray.900'} lineHeight={1} mb={2}>
                        {t('app:upload_file_extension_type_canSelectCustomFileExtension')}
                      </Box>
                      <Flex
                        gap={1}
                        alignItems={'center'}
                        flexWrap={'wrap'}
                        fontSize={'xs'}
                        color={'myGray.500'}
                        whiteSpace={'wrap'}
                        w="full"
                      >
                        {localValue.customFileExtensionList?.map((ext) => (
                          <Box
                            position={'relative'}
                            key={ext}
                            border="base"
                            borderRadius={'sm'}
                            color={'myGray.600'}
                            userSelect="none"
                            px={1}
                            py={0.5}
                            fontSize={'xs'}
                            minW={'50px'}
                            h={'22px'}
                            textAlign={'center'}
                          >
                            <Box>{ext}</Box>
                            <Flex
                              position="absolute"
                              top={0}
                              left={0}
                              right={0}
                              bottom={0}
                              alignItems="center"
                              justifyContent="center"
                              bg="rgba(255, 255, 255, 0.85)"
                              borderRadius={'sm'}
                              opacity={0}
                              cursor="pointer"
                              transition="opacity 0.2s"
                              _hover={{
                                opacity: 1
                              }}
                              onClick={(e) => {
                                e.stopPropagation();
                                e.preventDefault();
                                setLocalValue((state) => ({
                                  ...state,
                                  customFileExtensionList: (
                                    state.customFileExtensionList || []
                                  ).filter((prev) => prev !== ext)
                                }));
                              }}
                            >
                              <MyIcon
                                name={'delete'}
                                w={'14px'}
                                h={'14px'}
                                color={'red.600'}
                                _hover={{
                                  color: 'red.700'
                                }}
                              />
                            </Flex>
                          </Box>
                        ))}

                        <Flex
                          gap={1}
                          alignItems={'center'}
                          border="base"
                          borderRadius={'sm'}
                          cursor="pointer"
                          color={'myGray.600'}
                          _hover={{
                            color: 'primary.600',
                            borderColor: 'primary.600'
                          }}
                          _focusWithin={{
                            borderColor: 'primary.600',
                            boxShadow: shadowLight
                          }}
                          userSelect="none"
                          px={1}
                          py={0.5}
                          h={'22px'}
                          onClick={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            setIsAddingCustomFileExtension(true);
                          }}
                        >
                          {isAddingCustomFileExtension ? (
                            <Input
                              variant={'unstyled'}
                              value={customFileExtension}
                              autoFocus
                              fontSize={'xs'}
                              w={'50px'}
                              maxLength={7}
                              onChange={(e) =>
                                setCustomFileExtension(
                                  `.${e.target.value.replace(/^\./, '').trim()}`
                                )
                              }
                              onBlur={handleConfirmCustomFileExtension}
                              onKeyDown={(e) => {
                                if (e.key.toLowerCase() !== 'enter') return;
                                handleConfirmCustomFileExtension();
                              }}
                            />
                          ) : (
                            <Flex gap={1} alignItems={'center'} h={'22px'}>
                              <MyIcon name={'common/add2'} w={'12px'} h={'12px'} />
                              <Box fontSize={'xs'}>
                                {t(
                                  'app:upload_file_extension_type_canSelectCustomFileExtension_placeholder'
                                )}
                              </Box>
                            </Flex>
                          )}
                        </Flex>
                      </Flex>
                    </Checkbox>
                  </VStack>
                ) : (
                  <VStack key={type} w="full" spacing={2} alignItems={'flex-start'}>
                    <Checkbox
                      w="full"
                      alignItems={'flex-start'}
                      borderBottom="1px solid"
                      borderColor="myGray.200"
                      pb={3}
                      cursor="pointer"
                      isChecked={localValue[type as FileExtensionKeyType]}
                      onChange={(e) =>
                        handleCheckboxChange(type as FileExtensionKeyType, e.target.checked)
                      }
                    >
                      <Box color={'myGray.900'} lineHeight={1}>
                        {t(`app:upload_file_extension_type_${type}`)}
                      </Box>
                      <Box
                        mt={1}
                        fontSize={'xs'}
                        color={'myGray.500'}
                        wordBreak={'break-word'}
                        w="full"
                      >
                        {exts.map((ext) => ext.slice(1)).join('/')}
                      </Box>
                    </Checkbox>
                  </VStack>
                )
              )}
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
