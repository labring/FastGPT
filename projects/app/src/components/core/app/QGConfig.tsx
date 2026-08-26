import MyIcon from '@fastgpt/web/components/common/Icon';
import { Box, Button, Flex, useDisclosure, Switch, type BoxProps } from '@chakra-ui/react';

import React from 'react';
import { useTranslation } from 'next-i18next';
import type { AppQGConfigType } from '@fastgpt/global/core/app/type';
import MyModal from '@fastgpt/web/components/v2/common/MyModal';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import { defaultQGConfig } from '@fastgpt/global/core/app/constants';
import ChatFunctionTip from './Tip';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import AppConfigItem, { AppConfigItemAction } from './AppConfigItem';
import AIModelSelector from '@/components/Select/AIModelSelector';
import CustomPromptEditor from '@fastgpt/web/components/common/Textarea/CustomPromptEditor';
import {
  QuestionGuideFooterPrompt,
  QuestionGuidePrompt
} from '@fastgpt/global/core/ai/prompt/agent';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';

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

  const isOpenQG = value.open;

  const formLabel = isOpenQG
    ? t('common:core.app.whisper.Open')
    : t('common:core.app.whisper.Close');

  return (
    <>
      <AppConfigItem
        icon={'core/chat/QGFill'}
        label={t('common:core.app.Question Guide')}
        tip={<ChatFunctionTip type={'nextQuestion'} />}
        action={
          <AppConfigItemAction tooltip={t('app:config_question_guide')} onClick={onOpen}>
            {formLabel}
          </AppConfigItemAction>
        }
      />

      {isOpen && <QGConfigModal value={value} onChange={onChange} onClose={onClose} />}
    </>
  );
};

export default QGConfig;

const LabelStyles: BoxProps = {
  display: 'flex',
  alignItems: 'center',
  fontSize: 'sm',
  color: 'myGray.900',
  width: ['6rem', '8rem']
};
const QGConfigModal = ({
  value,
  onClose,
  onChange
}: {
  value: AppQGConfigType;
  onChange: (e: AppQGConfigType) => void;
  onClose: () => void;
}) => {
  const { t } = useTranslation();
  const customPrompt = value.customPrompt;
  const isOpenQG = value.open;
  const model = value?.modelId || value?.model;

  const {
    isOpen: isOpenCustomPrompt,
    onOpen: onOpenCustomPrompt,
    onClose: onCloseCustomPrompt
  } = useDisclosure();

  return (
    <>
      <MyModal
        title={t('common:core.chat.Question Guide')}
        isOpen
        onClose={onClose}
        width="500px"
        isCentered
        footer={<Button onClick={onClose}>{t('common:Confirm')}</Button>}
      >
        <Flex justifyContent={'space-between'} alignItems={'center'}>
          <FormLabel flex={'0 0 100px'}>{t('app:core.app.QG.Switch')}</FormLabel>
          <Switch
            isChecked={isOpenQG}
            onChange={(e) => {
              onChange({
                ...value,
                open: e.target.checked
              });
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
                  modelType={ModelTypeEnum.llm}
                  valueField="modelId"
                  width={'100%'}
                  value={model}
                  onChange={(e) => {
                    onChange({
                      ...value,
                      modelId: e
                    });
                  }}
                />
              </Box>
            </Flex>

            <Box mt={4}>
              <Flex alignItems={'center'} mb={1}>
                <FormLabel>{t('app:core.dataset.import.Custom prompt')}</FormLabel>
                <QuestionTip ml={1} label={t('common:core.app.QG.Custom prompt tip')} />
                <Box flex={1} />
                <Button
                  size="xs"
                  variant={'transparentBase'}
                  leftIcon={<MyIcon name={'edit'} w={'14px'} />}
                  onClick={onOpenCustomPrompt}
                >
                  {t('common:Edit')}
                </Button>
              </Flex>
              <Box
                position={'relative'}
                bg={'myGray.50'}
                border={'1px'}
                borderColor={'borderColor.base'}
                borderRadius={'md'}
                maxH={'200px'}
                overflow={'auto'}
                px={3}
                py={2}
                fontSize={'sm'}
                textAlign={'justify'}
                whiteSpace={'pre-wrap'}
                _hover={{
                  '& .mask': {
                    display: 'block'
                  }
                }}
              >
                {customPrompt || QuestionGuidePrompt}
              </Box>
            </Box>
          </>
        )}
      </MyModal>
      {isOpenCustomPrompt && (
        <CustomPromptEditor
          defaultValue={customPrompt}
          defaultPrompt={QuestionGuidePrompt}
          footerPrompt={QuestionGuideFooterPrompt}
          onChange={(e) => {
            onChange({
              ...value,
              customPrompt: e
            });
          }}
          onClose={onCloseCustomPrompt}
        />
      )}
    </>
  );
};
