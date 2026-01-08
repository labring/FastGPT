import React, { useState, useCallback } from 'react';
import { Box, Checkbox, VStack, Flex, Input } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import {
  defaultFileExtensionTypes,
  type FileExtensionKeyType
} from '@fastgpt/global/core/app/constants';
import MyIcon from '../../../common/Icon';

type FileTypeSelectorValue = {
  canSelectFile?: boolean;
  canSelectImg?: boolean;
  canSelectVideo?: boolean;
  canSelectAudio?: boolean;
  canSelectCustomFileExtension?: boolean;
  customFileExtensionList?: string[];
};

export const FileTypeSelectorPanel = ({
  value,
  onChange
}: {
  value: FileTypeSelectorValue;
  onChange: (value: FileTypeSelectorValue) => void;
}) => {
  const { t } = useTranslation();

  const [isAdding, setIsAdding] = useState(false);
  const [newExtension, setNewExtension] = useState('.');

  const handleTypeChange = (type: FileExtensionKeyType, checked: boolean) => {
    onChange({
      ...value,
      [type]: checked
    });
  };

  const handleConfirmCustomExtension = useCallback(() => {
    const currentList = value.customFileExtensionList || [];
    if (newExtension !== '.' && !currentList.includes(newExtension)) {
      onChange({
        ...value,
        customFileExtensionList: [...currentList, newExtension]
      });
    }

    setIsAdding(false);
    setNewExtension('.');
  }, [newExtension, value, onChange]);

  const handleRemoveExtension = useCallback(
    (ext: string) => {
      const currentList = value.customFileExtensionList || [];
      onChange({
        ...value,
        customFileExtensionList: currentList.filter((item) => item !== ext)
      });
    },
    [value, onChange]
  );

  return (
    <VStack w="full" spacing={3} alignItems={'flex-start'}>
      {Object.entries(defaultFileExtensionTypes).map(([type, exts]) =>
        type === 'canSelectCustomFileExtension' ? (
          <VStack key={type} w="full" spacing={2} alignItems={'flex-start'}>
            <Checkbox
              w="full"
              alignItems={'flex-start'}
              cursor="pointer"
              isChecked={value.canSelectCustomFileExtension ?? false}
              onChange={(e) => handleTypeChange(type as FileExtensionKeyType, e.target.checked)}
            >
              <Box color={'myGray.900'} lineHeight={1} mb={2}>
                {t('app:upload_file_extension_type_canSelectCustomFileExtension')}
              </Box>
              <Flex gap={1} alignItems={'center'} flexWrap={'wrap'}>
                {(value.customFileExtensionList || []).map((ext) => (
                  <Box
                    key={ext}
                    position={'relative'}
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
                      _hover={{ opacity: 1 }}
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        handleRemoveExtension(ext);
                      }}
                    >
                      <MyIcon
                        name={'delete'}
                        w={'14px'}
                        h={'14px'}
                        color={'red.600'}
                        _hover={{ color: 'red.700' }}
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
                    borderColor: 'primary.600'
                  }}
                  userSelect="none"
                  px={1}
                  py={0.5}
                  h={'22px'}
                  onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    setIsAdding(true);
                  }}
                >
                  {isAdding ? (
                    <Input
                      variant={'unstyled'}
                      value={newExtension}
                      autoFocus
                      fontSize={'xs'}
                      w={'50px'}
                      maxLength={7}
                      onChange={(e) =>
                        setNewExtension(`.${e.target.value.replace(/^\./, '').trim()}`)
                      }
                      onBlur={handleConfirmCustomExtension}
                      onKeyDown={(e) => {
                        if (e.key.toLowerCase() !== 'enter') return;
                        handleConfirmCustomExtension();
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
              isChecked={value[type as FileExtensionKeyType]}
              onChange={(e) => handleTypeChange(type as FileExtensionKeyType, e.target.checked)}
            >
              <Box color={'myGray.900'} lineHeight={1}>
                {t(`app:upload_file_extension_type_${type}`)}
              </Box>
              <Box mt={1} fontSize={'xs'} color={'myGray.500'} wordBreak={'break-word'} w="full">
                {exts.map((ext) => ext.slice(1)).join('/')}
              </Box>
            </Checkbox>
          </VStack>
        )
      )}
    </VStack>
  );
};
