import {
  Box,
  Button,
  Flex,
  Textarea,
  ModalFooter,
  HStack,
  Icon,
  ModalBody
} from '@chakra-ui/react';
import MyIcon from '../../Icon/index';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'next-i18next';
import MyModal from '../../MyModal';

const CustomLightTip = () => {
  const { t } = useTranslation();

  return (
    <HStack px="3" py="2" bgColor="primary.50" borderRadius="md" fontSize={'sm'}>
      <Icon name="common/info" w="1rem" color={'primary.600'} />
      <Box color="primary.600">
        {t('common:core.app.QG.Custom prompt tip1')}
        <Box as="span" color={'yellow.500'} fontWeight="500" display="inline">
          {t('common:core.app.QG.Custom prompt tip2')}
        </Box>
        {t('common:core.app.QG.Custom prompt tip3')}
      </Box>
    </HStack>
  );
};

const FixBox = ({ children }: { children: React.ReactNode }) => {
  return (
    <Box>
      <Box
        bg="yellow.100"
        as="span" // 改为 inline 元素
        display="inline" // 确保是行内显示
      >
        {children}
      </Box>
    </Box>
  );
};

const CustomPromptEditor = ({
  defaultValue = '',
  defaultPrompt,
  footerPrompt,
  onChange,
  onClose
}: {
  defaultValue?: string;
  defaultPrompt: string;
  footerPrompt?: string;
  onChange: (e: string) => void;
  onClose: () => void;
}) => {
  const ref = useRef<HTMLTextAreaElement>(null);
  const { t } = useTranslation();
  const [value, setValue] = useState(defaultValue || defaultPrompt);

  const adjustHeight = useCallback(() => {
    const textarea = ref.current;
    if (!textarea) return;

    textarea.style.height = '22px';
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
      w={'100%'}
      h={'85vh'}
      isCentered
    >
      <ModalBody flex={'1 0 0'} display={'flex'} flexDirection={'column'}>
        <CustomLightTip />

        <HStack my={3} justifyContent={'space-between'}>
          <Box fontWeight={'bold'} color={'myGray.600'}>
            {t('common:core.ai.Prompt')}
          </Box>

          <Button
            variant={'grayGhost'}
            size={'sm'}
            leftIcon={<MyIcon name={'common/retryLight'} w={'14px'} />}
            px={2}
            onClick={() => setValue(defaultPrompt)}
          >
            {t('common:Reset')}
          </Button>
        </HStack>

        <Box
          flex={'1 0 0'}
          overflow={'auto'}
          border="1px solid"
          borderColor="borderColor.base"
          borderRadius="md"
          bg={'myGray.50'}
          whiteSpace="pre-wrap"
          fontSize="sm"
          p={3}
        >
          <Textarea
            ref={ref}
            value={value}
            placeholder={t('common:prompt_input_placeholder')}
            onChange={(e) => setValue(e.target.value)}
            resize="none"
            bg="transparent"
            border="none"
            p={0}
            mb={2}
            rounded={'none'}
            _focus={{
              border: 'none',
              boxShadow: 'none'
            }}
          />
          {footerPrompt && <FixBox>{footerPrompt}</FixBox>}
        </Box>
      </ModalBody>
      <ModalFooter>
        <Flex gap={3}>
          <Button variant={'whiteBase'} fontWeight={'medium'} onClick={onClose} w={20}>
            {t('common:Close')}
          </Button>
          <Button
            fontWeight={'medium'}
            onClick={() => {
              onChange(value.replace(defaultPrompt, ''));
              onClose();
            }}
            w={20}
          >
            {t('common:Confirm')}
          </Button>
        </Flex>
      </ModalFooter>
    </MyModal>
  );
};

export default CustomPromptEditor;
