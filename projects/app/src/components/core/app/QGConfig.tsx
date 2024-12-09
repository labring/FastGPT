import MyIcon from '@fastgpt/web/components/common/Icon';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { Box, Button, Flex, ModalBody, useDisclosure, Switch, BoxProps } from '@chakra-ui/react';

import React, { useCallback } from 'react';
import { useTranslation } from 'next-i18next';
import type { AppQGConfigType } from '@fastgpt/global/core/app/type.d';
import MyModal from '@fastgpt/web/components/common/MyModal';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import { defaultQGConfig } from '@fastgpt/global/core/app/constants';
import ChatFunctionTip from './Tip';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import AIModelSelector from '@/components/Select/AIModelSelector';
import CustomPromptEditor from '@fastgpt/web/components/common/Textarea/CustomPromptEditor';

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

  const formLabel = isOpenQG
    ? t('common:core.app.whisper.Open')
    : t('common:core.app.whisper.Close');

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
      <MyTooltip label={t('app:core.app.QG.Switch')}>
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
      <QGConfigModal
        isOpen={isOpen}
        onClose={onClose}
        value={value}
        onChange={onChange}
        onOpenCustomPrompt={onOpenCustomPrompt}
        llmModelList={llmModelList}
        LabelStyles={LabelStyles}
        onChangeModel={onChangeModel}
      />

      {isOpenCustomPrompt && (
        <CustomPromptEditor
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

const QGConfigModal = ({
  isOpen,
  onClose,
  value,
  onChange,
  onOpenCustomPrompt,
  llmModelList,
  LabelStyles,
  onChangeModel
}: {
  isOpen: boolean;
  onClose: () => void;
  value: AppQGConfigType;
  onChange: (e: AppQGConfigType) => void;
  onOpenCustomPrompt: () => void;
  llmModelList: any[];
  LabelStyles: BoxProps;
  onChangeModel: (model: string) => void;
}) => {
  const { t } = useTranslation();
  const isOpenQG = value.open;
  const model = value?.model;
  const customPrompt = value.customPrompt;

  return (
    <MyModal
      width="500px"
      title={t('common:core.chat.Question Guide')}
      iconSrc="core/chat/QGFill"
      isOpen={isOpen}
      onClose={onClose}
    >
      <ModalBody px={[5, 10]} py={[4, 8]} pb={[4, 12]}>
        <Flex justifyContent={'space-between'} alignItems={'center'}>
          <FormLabel flex={'0 0 100px'}>{t('app:core.app.QG.Switch')}</FormLabel>
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
                <FormLabel>{t('app:core.dataset.import.Custom prompt')}</FormLabel>
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
                    {t('app:core.dataset.import.Custom prompt')}
                  </Button>
                </Box>
              </Box>
            </Box>
          </>
        )}
      </ModalBody>
    </MyModal>
  );
};
