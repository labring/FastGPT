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
  Stack
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

  console.log('customPrompt', customPrompt);

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
                if (checked && !value.model && llmModelList.length > 0) {
                  onChange({
                    ...value,
                    open: checked,
                    model: llmModelList[0].model
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

      {/* 添加编辑提示词的弹窗 */}
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
            <Box>
              <FormLabel color={'myGray.600'} fontWeight={'medium'} mb={3}>
                <Box mb={1}>
                  <LightTip text={t('common:core.app.QG.Custom prompt tip')} />
                </Box>
              </FormLabel>
              <Textarea
                ref={ref}
                rows={8}
                fontSize={'sm'}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                bg={'myGray.50'}
                h={'320px'}
                overflow={'auto'}
              />
            </Box>
            <Box flex={'0 0 auto'}>
              <Box
                p={3}
                bg={'myGray.50'}
                fontSize={'sm'}
                whiteSpace={'pre-wrap'}
                borderRadius={'md'}
                color={'myGray.500'}
              >
                {t('common:core.app.QG.Fixed Prompt')}
              </Box>
            </Box>
          </Stack>
        </Box>

        <Box flex={1} py={6} px={8}>
          <FormLabel color={'myGray.600'} fontWeight={'medium'} mb={3}>
            {t('common:core.app.QG.Complete Prompt')}
          </FormLabel>
          <Box
            p={3}
            fontSize={'sm'}
            whiteSpace={'pre-wrap'}
            borderRadius={'md'}
            h={'calc(100% - 10px)'}
            overflow={'auto'}
            border="1px solid"
            borderColor="gray.200"
          >
            <Box
              as="span"
              bg="yellow.100" // 或者使用其他你喜欢的高亮颜色
              px={1}
              borderRadius="sm"
            >
              {value || defaultValue}
            </Box>
            {'\n\n'}
            {t('common:core.app.QG.Fixed Prompt')}
          </Box>
        </Box>
      </Flex>
      <ModalFooter>
        <Button variant={'base'} mr={3} onClick={onClose}>
          {t('common:common.Cancel')}
        </Button>
        <Button
          onClick={() => {
            const val = value || '';
            onChange(val);
            onClose();
          }}
        >
          {t('common:common.Confirm')}
        </Button>
      </ModalFooter>
    </MyModal>
  );
};
