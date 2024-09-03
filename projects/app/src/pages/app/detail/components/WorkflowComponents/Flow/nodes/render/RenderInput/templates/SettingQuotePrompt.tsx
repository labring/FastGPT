import React, { useCallback, useMemo, useState } from 'react';
import type { RenderInputProps } from '../type';
import { Box, BoxProps, Button, Flex, ModalFooter, useDisclosure } from '@chakra-ui/react';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { useForm } from 'react-hook-form';
import { PromptTemplateItem } from '@fastgpt/global/core/ai/type';
import { useTranslation } from 'next-i18next';
import { ModalBody } from '@chakra-ui/react';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import {
  Prompt_QuotePromptList,
  Prompt_QuoteTemplateList
} from '@fastgpt/global/core/ai/prompt/AIChat';
import PromptEditor from '@fastgpt/web/components/common/Textarea/PromptEditor';
import PromptTemplate from '@/components/PromptTemplate';
import { NodeInputKeyEnum, WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import MyIcon from '@fastgpt/web/components/common/Icon';
import Reference from './Reference';
import ValueTypeLabel from '../../ValueTypeLabel';
import { useContextSelector } from 'use-context-selector';
import { WorkflowContext } from '@/pages/app/detail/components/WorkflowComponents/context';
import { getWorkflowGlobalVariables } from '@/web/core/workflow/utils';
import { useCreation } from 'ahooks';
import { AppContext } from '@/pages/app/detail/components/context';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import { datasetQuoteValueDesc } from '@fastgpt/global/core/workflow/node/constant';

const LabelStyles: BoxProps = {
  fontSize: ['sm', 'md']
};
const selectTemplateBtn: BoxProps = {
  color: 'primary.500',
  cursor: 'pointer'
};

const SettingQuotePrompt = (props: RenderInputProps) => {
  const { inputs = [], nodeId } = props;
  const { t } = useTranslation();
  const { isOpen, onOpen, onClose } = useDisclosure();
  const onChangeNode = useContextSelector(WorkflowContext, (v) => v.onChangeNode);
  const nodeList = useContextSelector(WorkflowContext, (v) => v.nodeList);

  const { watch, setValue, handleSubmit } = useForm({
    defaultValues: {
      quoteTemplate: inputs.find((input) => input.key === 'quoteTemplate')?.value || '',
      quotePrompt: inputs.find((input) => input.key === 'quotePrompt')?.value || ''
    }
  });
  const aiChatQuoteTemplate = watch('quoteTemplate');
  const aiChatQuotePrompt = watch('quotePrompt');
  const { appDetail } = useContextSelector(AppContext, (v) => v);

  const variables = useCreation(() => {
    const globalVariables = getWorkflowGlobalVariables({
      nodes: nodeList,
      chatConfig: appDetail.chatConfig
    });

    return globalVariables;
  }, [nodeList]);

  const [selectTemplateData, setSelectTemplateData] = useState<{
    title: string;
    templates: PromptTemplateItem[];
  }>();
  const quoteTemplateVariables = useMemo(
    () => [
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
        label: t('common:core.dataset.search.Source name'),
        icon: 'core/app/simpleMode/variable'
      },
      {
        key: 'sourceId',
        label: t('common:core.dataset.search.Source id'),
        icon: 'core/app/simpleMode/variable'
      },
      {
        key: 'index',
        label: t('common:core.dataset.search.Quote index'),
        icon: 'core/app/simpleMode/variable'
      },
      ...variables
    ],
    [t, variables]
  );
  const quotePromptVariables = useMemo(
    () => [
      {
        key: 'quote',
        label: t('common:core.app.Quote templates'),
        icon: 'core/app/simpleMode/variable'
      },
      {
        key: 'question',
        label: t('common:core.module.input.label.user question'),
        icon: 'core/app/simpleMode/variable'
      },
      ...variables
    ],
    [t, variables]
  );

  const onSubmit = useCallback(
    (data: { quoteTemplate: string; quotePrompt: string }) => {
      const quoteTemplateInput = inputs.find(
        (input) => input.key === NodeInputKeyEnum.aiChatQuoteTemplate
      );
      const quotePromptInput = inputs.find(
        (input) => input.key === NodeInputKeyEnum.aiChatQuotePrompt
      );
      if (quoteTemplateInput) {
        onChangeNode({
          nodeId,
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
          nodeId,
          type: 'updateInput',
          key: quotePromptInput.key,
          value: {
            ...quotePromptInput,
            value: data.quotePrompt
          }
        });
      }
      onClose();
    },
    [inputs, nodeId, onChangeNode, onClose]
  );

  const Render = useMemo(() => {
    return (
      <>
        <Flex className="nodrag" cursor={'default'} alignItems={'center'} position={'relative'}>
          <Box position={'relative'} color={'myGray.600'} fontWeight={'medium'}>
            {t('common:core.module.Dataset quote.label')}
          </Box>
          <ValueTypeLabel
            valueType={WorkflowIOValueTypeEnum.datasetQuote}
            valueDesc={datasetQuoteValueDesc}
          />

          <MyTooltip label={t('common:core.module.Setting quote prompt')}>
            <MyIcon
              ml={1}
              name={'common/settingLight'}
              w={'14px'}
              cursor={'pointer'}
              onClick={onOpen}
            />
          </MyTooltip>
        </Flex>
        <Box mt={1}>
          <Reference {...props} />
        </Box>

        <MyModal
          isOpen={isOpen}
          iconSrc={'modal/edit'}
          title={t('common:core.module.Quote prompt setting')}
          w={'600px'}
        >
          <ModalBody>
            <Box>
              <Flex {...LabelStyles} mb={1}>
                <FormLabel>{t('common:core.app.Quote templates')}</FormLabel>
                <QuestionTip
                  ml={1}
                  label={t('template.Quote Content Tip', {
                    default: Prompt_QuoteTemplateList[0].value
                  })}
                ></QuestionTip>
                <Box flex={1} />
                <Box
                  {...selectTemplateBtn}
                  fontSize={'sm'}
                  onClick={() =>
                    setSelectTemplateData({
                      title: t('common:core.app.Select quote template'),
                      templates: Prompt_QuoteTemplateList
                    })
                  }
                >
                  {t('common:common.Select template')}
                </Box>
              </Flex>

              <PromptEditor
                variables={quoteTemplateVariables}
                h={160}
                title={t('common:core.app.Quote templates')}
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
                <FormLabel>{t('common:core.app.Quote prompt')}</FormLabel>
                <QuestionTip
                  ml={1}
                  label={t('template.Quote Prompt Tip', {
                    default: Prompt_QuotePromptList[0].value
                  })}
                ></QuestionTip>
              </Flex>
              <PromptEditor
                variables={quotePromptVariables}
                title={t('common:core.app.Quote prompt')}
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
              {t('common:common.Close')}
            </Button>
            <Button onClick={handleSubmit(onSubmit)}>{t('common:common.Confirm')}</Button>
          </ModalFooter>
        </MyModal>
        {!!selectTemplateData && (
          <PromptTemplate
            title={selectTemplateData.title}
            templates={selectTemplateData.templates}
            onClose={() => setSelectTemplateData(undefined)}
            onSuccess={(e) => {
              const quoteVal = e.value;
              const promptVal = Prompt_QuotePromptList.find(
                (item) => item.title === e.title
              )?.value;
              setValue('quoteTemplate', quoteVal);
              setValue('quotePrompt', promptVal);
            }}
          />
        )}
      </>
    );
  }, [
    aiChatQuotePrompt,
    aiChatQuoteTemplate,
    handleSubmit,
    isOpen,
    onClose,
    onOpen,
    onSubmit,
    props,
    quotePromptVariables,
    quoteTemplateVariables,
    selectTemplateData,
    setValue,
    t
  ]);

  return Render;
};

export default React.memo(SettingQuotePrompt);
