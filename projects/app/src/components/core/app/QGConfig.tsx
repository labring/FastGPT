import MyIcon from '@fastgpt/web/components/common/Icon';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import {
  Box,
  Button,
  Flex,
  ModalBody,
  useDisclosure,
  Switch,
  Textarea,
  BoxProps,
  ModalFooter,
  Stack,
  HStack,
  Icon
} from '@chakra-ui/react';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'next-i18next';
import type { AppQGConfigType } from '@fastgpt/global/core/app/type.d';
import MyModal from '@fastgpt/web/components/common/MyModal';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import { defaultQGConfig } from '@fastgpt/global/core/app/constants';
import ChatFunctionTip from './Tip';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import AIModelSelector from '@/components/Select/AIModelSelector';

// question generator config
const QGConfig = ({
  value = defaultQGConfig,
  onChange
}: {
  value?: AppQGConfigType;
  onChange: (e: AppQGConfigType) => void;
}) => {
  const { t } = useTranslation();
  const { isOpen, onOpen, onClose } = useDisclosure();
  const { llmModelList } = useSystemStore();

  const {
    isOpen: isOpenCustomPrompt,
    onOpen: onOpenCustomPrompt,
    onClose: onCloseCustomPrompt
  } = useDisclosure();

  const isOpenQG = value.open;
  const model = value?.model;
  const customPrompt = value.customPrompt;

  const formLabel = isOpenQG ? t('common:core.app.QG.Open') : t('common:core.app.QG.Close');

  const onChangeModel = useCallback(
    (model: string) => {
      onChange({
        ...value,
        model
      });
    },
    [onChange, value]
  );

  const LabelStyles: BoxProps = {
    display: 'flex',
    alignItems: 'center',
    fontSize: 'sm',
    color: 'myGray.900',
    width: ['6rem', '8rem']
  };

  return (
    <Flex alignItems={'center'}>
      <MyIcon name={'core/chat/QGFill'} mr={2} w={'20px'} />
      <FormLabel>{t('common:core.app.Question Guide')}</FormLabel>
      <ChatFunctionTip type={'nextQuestion'} />
      <Box flex={1} />
      <MyTooltip label={t('common:core.app.QG.Switch')}>
        <Button
          variant={'transparentBase'}
          size={'sm'}
          mr={'-5px'}
          color={'myGray.600'}
          onClick={onOpen}
        >
          {formLabel}
        </Button>
      </MyTooltip>
      <MyModal
        width="500px"
        title={t('common:core.chat.Question Guide')}
        iconSrc="core/chat/QGFill"
        isOpen={isOpen}
        onClose={onClose}
      >
        <ModalBody px={[5, 10]} py={[4, 8]} pb={[4, 12]}>
          <Flex justifyContent={'space-between'} alignItems={'center'}>
            <FormLabel flex={'0 0 100px'}>{t('common:core.app.QG.Switch')}</FormLabel>
            <Switch
              isChecked={isOpenQG}
              onChange={(e) => {
                const checked = e.target.checked;
                if (checked) {
                  onChange({
                    ...value,
                    open: checked,
                    model: value.model || defaultQGConfig.model,
                    customPrompt: value.customPrompt || defaultQGConfig.customPrompt
                  });
                } else {
                  onChange({
                    ...value,
                    open: checked
                  });
                }
              }}
            />
          </Flex>
          {isOpenQG && (
            <>
              <Flex alignItems={'center'} mt={4}>
                <Box {...LabelStyles} mr={2}>
                  {t('common:core.ai.Model')}
                </Box>
                <Box flex={'1 0 0'}>
                  <AIModelSelector
                    width={'100%'}
                    value={model}
                    list={llmModelList.map((item) => ({
                      value: item.model,
                      label: item.name
                    }))}
                    onchange={onChangeModel}
                  />
                </Box>
              </Flex>

              <Box mt={4}>
                <Flex alignItems={'center'} mb={1}>
                  <FormLabel>{t('common:core.dataset.import.Custom prompt')}</FormLabel>
                  <QuestionTip ml={1} label={t('common:core.app.QG.Custom prompt tip')} />
                </Flex>
                <Box
                  position={'relative'}
                  bg={'myGray.50'}
                  border={'1px'}
                  borderColor={'borderColor.base'}
                  borderRadius={'md'}
                  maxH={'140px'}
                  minH={'100px'}
                  overflow={'hidden'}
                  _hover={{
                    '& .mask': {
                      display: 'block'
                    }
                  }}
                >
                  <Box px={3} py={2} height={'140px'}>
                    {customPrompt}
                  </Box>
                  <Box
                    display={'none'}
                    className="mask"
                    position={'absolute'}
                    inset={0}
                    height={'140px'}
                    pointerEvents={'none'}
                    background={
                      'linear-gradient(182deg, rgba(255, 255, 255, 0.00) 1.76%, #FFF 84.07%)'
                    }
                  >
                    <Button
                      size="xs"
                      variant={'whiteBase'}
                      leftIcon={<MyIcon name={'edit'} w={'13px'} />}
                      color={'black'}
                      position={'absolute'}
                      right={2}
                      bottom={2}
                      pointerEvents={'auto'}
                      onClick={onOpenCustomPrompt}
                    >
                      {t('common:core.dataset.import.Custom prompt')}
                    </Button>
                  </Box>
                </Box>
              </Box>
            </>
          )}
        </ModalBody>
      </MyModal>

      {isOpenCustomPrompt && (
        <PromptTextarea
          defaultValue={customPrompt || ''}
          onChange={(e) => {
            onChange({
              ...value,
              customPrompt: e
            });
          }}
          onClose={onCloseCustomPrompt}
        />
      )}
    </Flex>
  );
};

export default QGConfig;

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

const PromptTextarea = ({
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
      title={t('common:core.dataset.import.Custom prompt')}
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
                {t('common:core.app.QG.Fixed Prompt')}
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
