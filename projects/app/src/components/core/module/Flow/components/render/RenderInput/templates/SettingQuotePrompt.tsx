import React, { useMemo, useState } from 'react';
import type { RenderInputProps } from '../type';
import { Box, BoxProps, Button, Flex, ModalFooter, useDisclosure } from '@chakra-ui/react';
import { onChangeNode, useFlowProviderStore } from '../../../../FlowProvider';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { useForm } from 'react-hook-form';
import { PromptTemplateItem } from '@fastgpt/global/core/ai/type';
import { useTranslation } from 'next-i18next';
import {
  formatEditorVariablePickerIcon,
  getGuideModule,
  splitGuideModule
} from '@fastgpt/global/core/module/utils';
import { ModalBody } from '@chakra-ui/react';
import MyTooltip from '@/components/MyTooltip';
import {
  Prompt_QuotePromptList,
  Prompt_QuoteTemplateList
} from '@fastgpt/global/core/ai/prompt/AIChat';
import { QuestionOutlineIcon } from '@chakra-ui/icons';
import PromptEditor from '@fastgpt/web/components/common/Textarea/PromptEditor';
import PromptTemplate from '@/components/PromptTemplate';
import { ModuleInputKeyEnum } from '@fastgpt/global/core/module/constants';

const SettingQuotePrompt = ({ inputs = [], moduleId }: RenderInputProps) => {
  const { t } = useTranslation();
  const { isOpen, onOpen, onClose } = useDisclosure();
  const { nodes } = useFlowProviderStore();
  const { watch, setValue, handleSubmit } = useForm({
    defaultValues: {
      quoteTemplate: inputs.find((input) => input.key === 'quoteTemplate')?.value || '',
      quotePrompt: inputs.find((input) => input.key === 'quotePrompt')?.value || ''
    }
  });
  const aiChatQuoteTemplate = watch('quoteTemplate');
  const aiChatQuotePrompt = watch('quotePrompt');

  const variables = useMemo(() => {
    const globalVariables = formatEditorVariablePickerIcon(
      splitGuideModule(getGuideModule(nodes.map((node) => node.data)))?.variableModules || []
    );
    const moduleVariables = formatEditorVariablePickerIcon(
      inputs
        .filter((input) => input.edit)
        .map((item) => ({
          key: item.key,
          label: item.label
        }))
    );
    const systemVariables = [
      {
        key: 'cTime',
        label: t('core.module.http.Current time')
      }
    ];

    return [...globalVariables, ...moduleVariables, ...systemVariables];
  }, [inputs, t]);
  const [selectTemplateData, setSelectTemplateData] = useState<{
    title: string;
    templates: PromptTemplateItem[];
  }>();
  const quoteTemplateVariables = (() => [
    {
      key: 'q',
      label: 'q',
      icon: 'core/app/simpleMode/variable'
    },
    {
      key: 'a',
      label: 'a',
      icon: 'core/app/simpleMode/variable'
    },
    {
      key: 'source',
      label: t('core.dataset.search.Source name'),
      icon: 'core/app/simpleMode/variable'
    },
    {
      key: 'sourceId',
      label: t('core.dataset.search.Source id'),
      icon: 'core/app/simpleMode/variable'
    },
    {
      key: 'index',
      label: t('core.dataset.search.Quote index'),
      icon: 'core/app/simpleMode/variable'
    },
    ...variables
  ])();
  const quotePromptVariables = (() => [
    {
      key: 'quote',
      label: t('core.app.Quote templates'),
      icon: 'core/app/simpleMode/variable'
    },
    {
      key: 'question',
      label: t('core.module.input.label.user question'),
      icon: 'core/app/simpleMode/variable'
    },
    ...variables
  ])();

  const LabelStyles: BoxProps = {
    fontSize: ['sm', 'md']
  };
  const selectTemplateBtn: BoxProps = {
    color: 'primary.500',
    cursor: 'pointer'
  };

  const onSubmit = (data: { quoteTemplate: string; quotePrompt: string }) => {
    const quoteTemplateInput = inputs.find(
      (input) => input.key === ModuleInputKeyEnum.aiChatQuoteTemplate
    );
    const quotePromptInput = inputs.find(
      (input) => input.key === ModuleInputKeyEnum.aiChatQuotePrompt
    );
    if (quoteTemplateInput) {
      onChangeNode({
        moduleId,
        type: 'updateInput',
        key: quoteTemplateInput.key,
        value: {
          ...quoteTemplateInput,
          value: data.quoteTemplate
        }
      });
    }
    if (quotePromptInput) {
      onChangeNode({
        moduleId,
        type: 'updateInput',
        key: quotePromptInput.key,
        value: {
          ...quotePromptInput,
          value: data.quotePrompt
        }
      });
    }
    onClose();
  };

  return (
    <>
      <Button variant={'whitePrimary'} size={'sm'} onClick={onOpen}>
        {t('core.module.Setting quote prompt')}
      </Button>
      <MyModal
        isOpen={isOpen}
        iconSrc={'modal/edit'}
        title={t('core.module.Quote prompt setting')}
        w={'600px'}
      >
        <ModalBody>
          <Box>
            <Flex {...LabelStyles} mb={1}>
              {t('core.app.Quote templates')}
              <MyTooltip
                label={t('template.Quote Content Tip', {
                  default: Prompt_QuoteTemplateList[0].value
                })}
                forceShow
              >
                <QuestionOutlineIcon display={['none', 'inline']} ml={1} />
              </MyTooltip>
              <Box flex={1} />
              <Box
                {...selectTemplateBtn}
                onClick={() =>
                  setSelectTemplateData({
                    title: t('core.app.Select quote template'),
                    templates: Prompt_QuoteTemplateList
                  })
                }
              >
                {t('common.Select template')}
              </Box>
            </Flex>

            <PromptEditor
              variables={quoteTemplateVariables}
              h={160}
              title={t('core.app.Quote templates')}
              placeholder={t('template.Quote Content Tip', {
                default: Prompt_QuoteTemplateList[0].value
              })}
              value={aiChatQuoteTemplate}
              onChange={(e) => {
                setValue('quoteTemplate', e);
              }}
            />
          </Box>
          <Box mt={4}>
            <Flex {...LabelStyles} mb={1}>
              {t('core.app.Quote prompt')}
              <MyTooltip
                label={t('template.Quote Prompt Tip', { default: Prompt_QuotePromptList[0].value })}
                forceShow
              >
                <QuestionOutlineIcon display={['none', 'inline']} ml={1} />
              </MyTooltip>
            </Flex>
            <PromptEditor
              variables={quotePromptVariables}
              title={t('core.app.Quote prompt')}
              h={280}
              placeholder={t('template.Quote Prompt Tip', {
                default: Prompt_QuotePromptList[0].value
              })}
              value={aiChatQuotePrompt}
              onChange={(e) => {
                setValue('quotePrompt', e);
              }}
            />
          </Box>
        </ModalBody>
        <ModalFooter>
          <Button variant={'whiteBase'} mr={2} onClick={onClose}>
            {t('common.Close')}
          </Button>
          <Button onClick={handleSubmit(onSubmit)}>{t('common.Confirm')}</Button>
        </ModalFooter>
      </MyModal>
      {!!selectTemplateData && (
        <PromptTemplate
          title={selectTemplateData.title}
          templates={selectTemplateData.templates}
          onClose={() => setSelectTemplateData(undefined)}
          onSuccess={(e) => {
            const quoteVal = e.value;
            const promptVal = Prompt_QuotePromptList.find((item) => item.title === e.title)?.value;
            setValue('quoteTemplate', quoteVal);
            setValue('quotePrompt', promptVal);
          }}
        />
      )}
    </>
  );
};

export default React.memo(SettingQuotePrompt);
