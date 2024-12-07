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

import React, { useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'next-i18next';
import type { AppQGConfigType } from '@fastgpt/global/core/app/type.d';
import MyModal from '@fastgpt/web/components/common/MyModal';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import { defaultQGConfig } from '@fastgpt/global/core/app/constants';
import ChatFunctionTip from './Tip';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import AIModelSelector from '@/components/Select/AIModelSelector';
import LightTip from '@fastgpt/web/components/common/LightTip';

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
      <FormLabel color={'myGray.600'}>{t('common:core.app.Question Guide')}</FormLabel>
      <ChatFunctionTip type={'nextQuestion'} />
      <Box flex={1} />
      <MyTooltip label={t('common:core.app.QG.Switch')}>
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
                  <FormLabel mb={0}>{t('common:core.dataset.import.Custom prompt')}</FormLabel>
                  <QuestionTip ml={1} label={t('common:core.app.QG.Custom prompt tip')} />
                </Flex>
                <Box
                  position={'relative'}
                  bg={'myGray.50'}
                  fontSize={'sm'}
                  whiteSpace={'pre-wrap'}
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
                  <Box overflow={'auto'} px={3} py={2} height={'140px'}>
                    {customPrompt}
                  </Box>
                  <Box
                    display={'none'}
                    className="mask"
                    position={'absolute'}
                    top={0}
                    right={0}
                    bottom={0}
                    left={0}
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
      <Box fontSize={'sm'}>
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

  const fixedPrompt = `\n\n${t('common:core.app.QG.Fixed Prompt')}`;
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
      <Flex h={'494px'}>
        <Box flex={1} py={6} px={8} borderRight={'1px solid'} borderColor={'borderColor.base'}>
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
                <Box ml={1} fontSize={'sm'} color={'myGray.600'}>
                  {t('common:common.Reset')}
                </Box>
              </Flex>
            </Flex>
            <Box>
              <Textarea
                ref={ref}
                rows={8}
                fontSize={'sm'}
                value={value + fixedPrompt}
                onChange={(e) => {
                  const newValue = e.target.value.replace(fixedPrompt, '');
                  setValue(newValue);
                }}
                bg={'myGray.50'}
                h={'320px'}
                overflow={'auto'}
                onKeyDown={(e) => {
                  const start = e.currentTarget.selectionStart;
                  const end = e.currentTarget.selectionEnd;

                  const promptStart = value.length;

                  if (start > promptStart || end > promptStart) {
                    e.preventDefault();
                  }
                }}
                onSelect={(e) => {
                  const start = e.currentTarget.selectionStart;
                  const promptStart = value.length;

                  if (start > promptStart) {
                    e.currentTarget.setSelectionRange(promptStart, promptStart);
                  }
                }}
              />
            </Box>
          </Stack>
        </Box>
      </Flex>
      <ModalFooter>
        <Flex justify={'flex-end'} gap={3} pb={2} pr={8}>
          <Button variant={'whiteBase'} fontWeight={'medium'} onClick={onClose} w={20}>
            {t('common:common.Close')}
          </Button>
          <Button
            fontWeight={'medium'}
            onClick={() => {
              const val = value || '';
              onChange(val);
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
