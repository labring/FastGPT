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
import React, { useMemo, useRef, useState } from 'react';
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
import {
  defaultAppSelectFileConfig,
  defaultFileExtensionTypes
} from '@fastgpt/global/core/app/constants';
import NumberInput from '@fastgpt/web/components/common/Input/NumberInput';

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

  const formLabel = useMemo(
    () =>
      value.canSelectFile ||
      value.canSelectImg ||
      value.canSelectVideo ||
      value.canSelectAudio ||
      value.canSelectCustomFileExtension
        ? t('common:core.app.whisper.Open')
        : t('common:core.app.whisper.Close'),
    [
      t,
      value.canSelectFile,
      value.canSelectImg,
      value.canSelectVideo,
      value.canSelectAudio,
      value.canSelectCustomFileExtension
    ]
  );

  const handleCheckboxChange = (t: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const type = t as keyof typeof defaultFileExtensionTypes | 'canSelectCustomFileExtension';
    if (type === 'canSelectFile') {
      setLocalValue({
        ...localValue,
        canSelectFile: e.target.checked
      });
    } else if (type === 'canSelectImg') {
      setLocalValue({
        ...localValue,
        canSelectImg: e.target.checked
      });
    } else if (type === 'canSelectVideo') {
      setLocalValue({
        ...localValue,
        canSelectVideo: e.target.checked
      });
    } else if (type === 'canSelectAudio') {
      setLocalValue({
        ...localValue,
        canSelectAudio: e.target.checked
      });
    } else if (type === 'canSelectCustomFileExtension') {
      setLocalValue({
        ...localValue,
        canSelectCustomFileExtension: e.target.checked
      });
    }
  };

  const handleConfirmCustomFileExtension = () => {
    if (customFileExtension !== '.') {
      setLocalValue({
        ...localValue,
        customFileExtensionList: [
          ...(localValue.customFileExtensionList || []),
          customFileExtension
        ]
      });
    }
    setCustomFileExtension('.');
    setIsAddingCustomFileExtension(false);
  };

  const handleDeleteCustomFileExtension = (extToDelete: string) => {
    setLocalValue({
      ...localValue,
      customFileExtensionList: (localValue.customFileExtensionList || []).filter(
        (ext) => ext !== extToDelete
      )
    });
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

            <Flex mt={2} alignItems={'center'} gap={5}>
              <Box flex="1 0 0">
                <MySlider
                  markList={[
                    { label: '1', value: 1 },
                    { label: `${maxSelectFiles}`, value: maxSelectFiles }
                  ]}
                  width={'100%'}
                  min={1}
                  max={maxSelectFiles}
                  step={1}
                  value={localValue.maxFiles ?? 5}
                  onChange={(e) => {
                    setLocalValue({
                      ...localValue,
                      maxFiles: e
                    });
                  }}
                />
              </Box>

              <Box w="68px">
                <NumberInput
                  size="sm"
                  min={1}
                  max={15}
                  value={localValue.maxFiles ?? 5}
                  onChange={(e) => {
                    setLocalValue({
                      ...localValue,
                      maxFiles: e ?? 5
                    });
                  }}
                />
              </Box>
            </Flex>
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
              {Object.entries(defaultFileExtensionTypes).map(([type, exts]) => (
                <VStack w="full" key={type} spacing={2} alignItems={'flex-start'}>
                  <Checkbox
                    w="full"
                    alignItems={'flex-start'}
                    cursor="default"
                    sx={{
                      '& .chakra-checkbox__label': {
                        w: `calc(100% - 24px)`
                      },
                      '& .chakra-checkbox__control': {
                        cursor: 'pointer',
                        mt: 0.5
                      }
                    }}
                    borderBottom="1px solid"
                    borderColor="myGray.200"
                    pb={3}
                    isChecked={localValue[type as keyof typeof defaultFileExtensionTypes]}
                    onChange={(e) => handleCheckboxChange(type, e)}
                  >
                    <VStack w="full" spacing={1} alignItems={'flex-start'}>
                      <Box color={'myGray.700'}>{t(`app:upload_file_extension_type_${type}`)}</Box>
                      <Box fontSize={'xs'} color={'myGray.500'} whiteSpace={'wrap'} w="full">
                        {exts.map((ext) => ext.slice(1)).join('/')}
                      </Box>
                    </VStack>
                  </Checkbox>
                </VStack>
              ))}

              <VStack w="full" spacing={2} alignItems={'flex-start'}>
                <Checkbox
                  w="full"
                  alignItems={'flex-start'}
                  cursor="default"
                  sx={{
                    '& .chakra-checkbox__label': {
                      w: `calc(100% - 24px)`
                    },
                    '& .chakra-checkbox__control': {
                      cursor: 'pointer',
                      mt: 0.5
                    }
                  }}
                  isChecked={localValue.canSelectCustomFileExtension}
                  onChange={(e) => handleCheckboxChange('canSelectCustomFileExtension', e)}
                >
                  <VStack w="full" spacing={1} alignItems={'flex-start'}>
                    <Box color={'myGray.700'}>
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
                          key={ext}
                          position="relative"
                          role="group"
                          border="1px solid"
                          borderColor="myGray.200"
                          borderRadius={'sm'}
                          color={'myGray.600'}
                          transition="all 0.2s"
                          userSelect="none"
                          px={1}
                          py={0.5}
                          fontSize={'12px'}
                          minW={'50px'}
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
                            _groupHover={{
                              opacity: 1
                            }}
                            onClick={(e) => {
                              e.stopPropagation();
                              e.preventDefault();
                              setLocalValue({
                                ...localValue,
                                customFileExtensionList: (
                                  localValue.customFileExtensionList || []
                                ).filter((prev) => prev !== ext)
                              });
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
                        border="1px solid"
                        borderColor="myGray.200"
                        borderRadius={'sm'}
                        cursor="pointer"
                        color={'myGray.600'}
                        _hover={{
                          color: 'primary.600',
                          boxShadow: '0px 0px 0.5px 0.5px rgb(51, 112, 255)'
                        }}
                        _focusWithin={{
                          color: 'primary.600',
                          boxShadow: '0px 0px 0.5px 0.5px rgb(51, 112, 255)'
                        }}
                        transition="all 0.2s"
                        userSelect="none"
                        px={1}
                        py={0.5}
                        onClick={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          setIsAddingCustomFileExtension(true);
                        }}
                      >
                        {isAddingCustomFileExtension ? (
                          <input
                            type="text"
                            value={customFileExtension}
                            autoFocus
                            style={{ width: '50px', fontSize: '12px' }}
                            onChange={(e) =>
                              setCustomFileExtension(`.${e.target.value.replace(/^\./, '').trim()}`)
                            }
                            onBlur={handleConfirmCustomFileExtension}
                            onKeyDown={(e) => {
                              if (e.key.toLowerCase() !== 'enter') return;
                              handleConfirmCustomFileExtension();
                            }}
                          />
                        ) : (
                          <Flex gap={1} alignItems={'center'}>
                            <MyIcon name={'common/add2'} w={'12px'} h={'12px'} />
                            <Box fontSize={'12px'}>
                              {t(
                                'app:upload_file_extension_type_canSelectCustomFileExtension_placeholder'
                              )}
                            </Box>
                          </Flex>
                        )}
                      </Flex>
                    </Flex>
                  </VStack>
                </Checkbox>
              </VStack>
            </VStack>
          </VStack>

          {localValue.canSelectFile && feConfigs.showCustomPdfParse && (
            <HStack justifyContent={'flex-start'} spacing={1} mt={2}>
              <Checkbox
                isChecked={localValue.customPdfParse}
                onChange={(e) => {
                  setLocalValue({
                    ...localValue,
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
