import {
  Box,
  Button,
  Flex,
  Textarea,
  ModalFooter,
  Stack,
  FormLabel,
  HStack,
  Icon
} from '@chakra-ui/react';
import MyIcon from '../../Icon/index';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'next-i18next';
import { defaultQGConfig } from '@fastgpt/global/core/app/constants';
import MyModal from '../../MyModal';

export const SYSTEM_PROMPT_QUESTION_GUIDE = `Please strictly follow the format rules: \nReturn questions in JSON format: ['Question 1', 'Question 2', 'Question 3'].`;

const CustomLightTip = () => {
  const { t } = useTranslation();

  return (
    <HStack px="3" py="1" color="primary.600" bgColor="primary.50" borderRadius="md">
      <Icon name="common/info" w="1rem" />
      <Box>
        {t('common:core.app.QG.Custom prompt tip1')}
        <Box as="span" color={'yellow.500'} fontWeight="500" display="inline">
          {t('common:core.app.QG.Custom prompt tip2')}
        </Box>
        {t('common:core.app.QG.Custom prompt tip3')}
      </Box>
    </HStack>
  );
};

const CustomPromptEditor = ({
  defaultValue,
  onChange,
  onClose
}: {
  defaultValue: string;
  onChange: (e: string) => void;
  onClose: () => void;
}) => {
  const ref = useRef<HTMLTextAreaElement>(null);
  const { t } = useTranslation();
  const [value, setValue] = useState(defaultValue);
  const defaultPrompt = defaultQGConfig.customPrompt;

  const adjustHeight = useCallback(() => {
    const textarea = ref.current;
    if (!textarea) return;

    textarea.style.height = 'auto';
    textarea.style.height = `${textarea.scrollHeight}px`;
  }, []);

  useEffect(() => {
    adjustHeight();
    const timer = setTimeout(adjustHeight, 0);
    return () => clearTimeout(timer);
  }, [value, adjustHeight]);

  return (
    <MyModal
      isOpen
      onClose={onClose}
      iconSrc="modal/edit"
      title={t('app:core.dataset.import.Custom prompt')}
      maxW={['90vw', '878px']}
      w={'100%'}
      isCentered
    >
      <Box py={6} px={8}>
        <Stack spacing={4}>
          <FormLabel color={'myGray.600'} fontWeight={'medium'}>
            <CustomLightTip />
          </FormLabel>
          <Flex justifyContent={'space-between'} alignItems={'center'}>
            <FormLabel color={'myGray.600'} fontWeight={'bold'} fontSize={'md'}>
              {t('common:core.ai.Prompt')}
            </FormLabel>

            <Flex
              alignItems={'center'}
              cursor={'pointer'}
              onClick={() => setValue(defaultPrompt || '')}
            >
              <MyIcon name={'common/retryLight'} w={'14px'} h={'14px'} color={'myGray.600'} />
              <Box ml={1} color={'myGray.600'}>
                {t('common:common.Reset')}
              </Box>
            </Flex>
          </Flex>
          <Box
            border="1px solid"
            borderColor="borderColor.base"
            borderRadius="md"
            bg={'myGray.50'}
            minH="320px"
          >
            <Textarea
              ref={ref}
              fontSize={'sm'}
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
              }}
              resize="none"
              overflow="hidden"
              p={3}
              bg="transparent"
              border="none"
              _focus={{
                border: 'none',
                boxShadow: 'none'
              }}
            />
            <Box px={3} py={2} fontSize="sm" whiteSpace="pre-wrap">
              <Box as="span" bg="yellow.100" px={1} py={0.5} borderRadius="sm">
                {SYSTEM_PROMPT_QUESTION_GUIDE}
              </Box>
            </Box>
          </Box>
        </Stack>
      </Box>
      <ModalFooter>
        <Flex gap={3}>
          <Button variant={'whiteBase'} fontWeight={'medium'} onClick={onClose} w={20}>
            {t('common:common.Close')}
          </Button>
          <Button
            fontWeight={'medium'}
            onClick={() => {
              onChange(value);
              onClose();
            }}
            w={20}
          >
            {t('common:common.Confirm')}
          </Button>
        </Flex>
      </ModalFooter>
    </MyModal>
  );
};

export default CustomPromptEditor;
