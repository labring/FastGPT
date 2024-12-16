import MyIcon from '@fastgpt/web/components/common/Icon';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { Box, Button, Flex, ModalBody, useDisclosure, Switch, BoxProps } from '@chakra-ui/react';

import React from 'react';
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
import {
  PROMPT_QUESTION_GUIDE,
  PROMPT_QUESTION_GUIDE_FOOTER
} from '@fastgpt/global/core/ai/prompt/agent';

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
    <Flex alignItems={'center'}>
      <MyIcon name={'core/chat/QGFill'} mr={2} w={'20px'} />
      <FormLabel>{t('common:core.app.Question Guide')}</FormLabel>
      <ChatFunctionTip type={'nextQuestion'} />
      <Box flex={1} />
      <MyTooltip label={t('app:config_question_guide')}>
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

      {isOpen && <QGConfigModal value={value} onChange={onChange} onClose={onClose} />}
    </Flex>
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
  const { llmModelList } = useSystemStore();

  const customPrompt = value.customPrompt;
  const isOpenQG = value.open;
  const model = value?.model || llmModelList?.[0]?.model;

  const {
    isOpen: isOpenCustomPrompt,
    onOpen: onOpenCustomPrompt,
    onClose: onCloseCustomPrompt
  } = useDisclosure();

  return (
    <>
      <MyModal
        title={t('common:core.chat.Question Guide')}
        iconSrc="core/chat/QGFill"
        isOpen
        onClose={onClose}
        width="500px"
      >
        <ModalBody px={[5, 10]} py={[4, 8]} pb={[4, 12]}>
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
                    width={'100%'}
                    value={model}
                    list={llmModelList.map((item) => ({
                      value: item.model,
                      label: item.name
                    }))}
                    onchange={(e) => {
                      onChange({
                        ...value,
                        model: e
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
                    {t('common:common.Edit')}
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
                  {customPrompt || PROMPT_QUESTION_GUIDE}
                </Box>
              </Box>
            </>
          )}
        </ModalBody>
      </MyModal>
      {isOpenCustomPrompt && (
        <CustomPromptEditor
          defaultValue={customPrompt}
          defaultPrompt={PROMPT_QUESTION_GUIDE}
          footerPrompt={PROMPT_QUESTION_GUIDE_FOOTER}
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
