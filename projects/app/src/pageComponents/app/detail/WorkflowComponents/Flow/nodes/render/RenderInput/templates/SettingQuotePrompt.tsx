import React, { useCallback, useMemo, useState } from 'react';
import type { RenderInputProps } from '../type';
import { Box, type BoxProps, Button, Flex, ModalFooter, useDisclosure } from '@chakra-ui/react';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { useForm } from 'react-hook-form';
import { type PromptTemplateItem } from '@fastgpt/global/core/ai/llm/type';
import type { AppChatConfigType } from '@fastgpt/global/core/app/type';
import { useSafeTranslation } from '@fastgpt/web/hooks/useSafeTranslation';
import { ModalBody } from '@chakra-ui/react';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import {
  Prompt_userQuotePromptList,
  Prompt_QuoteTemplateList,
  Prompt_systemQuotePromptList,
  getQuoteTemplate,
  getQuotePrompt
} from '@fastgpt/global/core/ai/prompt/AIChat';
import PromptEditor from '@fastgpt/web/components/common/Textarea/PromptEditor';
import PromptTemplate from '@/components/PromptTemplate';
import { NodeInputKeyEnum, WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import MyIcon from '@fastgpt/web/components/common/Icon';
import Reference from './Reference';
import ValueTypeLabel from '../../ValueTypeLabel';
import { getWorkflowGlobalVariables } from '@/web/core/workflow/utils';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import { datasetQuoteValueDesc } from '@fastgpt/global/core/workflow/node/constant';
import type { AiChatQuoteRoleType } from '@fastgpt/global/core/workflow/template/system/aiChat/type';
import {
  AiChatQuotePrompt,
  AiChatQuoteRole,
  AiChatQuoteTemplate
} from '@fastgpt/global/core/workflow/template/system/aiChat';
import MySelect from '@fastgpt/web/components/common/MySelect';
import LightTip from '@fastgpt/web/components/common/LightTip';
import { useField, useNodeActions } from '@/web/core/workflow/editor';
import { useMemoEnhance } from '@fastgpt/web/hooks/useMemoEnhance';
import { useNodeWorkflowDocument } from '../../useWorkflowDocument';

const LabelStyles: BoxProps = {
  fontSize: ['sm', 'md']
};
const selectTemplateBtn: BoxProps = {
  color: 'primary.500',
  cursor: 'pointer'
};

const EditModal = ({ onClose, ...props }: RenderInputProps & { onClose: () => void }) => {
  const { inputs = [], nodeId } = props;
  const { t } = useSafeTranslation();
  const nodeActions = useNodeActions(nodeId);
  const quoteTemplateField = useField(nodeId, NodeInputKeyEnum.aiChatQuoteTemplate, 'input');
  const quotePromptField = useField(nodeId, NodeInputKeyEnum.aiChatQuotePrompt, 'input');
  const quoteRoleField = useField(nodeId, NodeInputKeyEnum.aiChatQuoteRole, 'input');
  const { workflow } = useNodeWorkflowDocument({ nodeId });
  const nodeVersion = workflow?.nodes.find((node) => node.nodeId === nodeId)?.version;

  const quoteTemplateInput =
    quoteTemplateField?.data.input ??
    inputs.find((input) => input.key === NodeInputKeyEnum.aiChatQuoteTemplate);
  const quotePromptInput =
    quotePromptField?.data.input ??
    inputs.find((input) => input.key === NodeInputKeyEnum.aiChatQuotePrompt);
  const quoteRoleInput =
    quoteRoleField?.data.input ??
    inputs.find((input) => input.key === NodeInputKeyEnum.aiChatQuoteRole);

  const { watch, setValue, handleSubmit } = useForm({
    defaultValues: {
      quoteTemplate: quoteTemplateInput?.value || '',
      quotePrompt: quotePromptInput?.value || '',
      quoteRole: (quoteRoleInput?.value || 'system') as AiChatQuoteRoleType
    }
  });
  const aiChatQuoteTemplate = watch('quoteTemplate');
  const aiChatQuotePrompt = watch('quotePrompt');
  const aiChatQuoteRole = watch('quoteRole');
  const variables = useMemoEnhance(() => {
    if (!workflow) return [];
    const globalVariables = getWorkflowGlobalVariables({
      chatConfig: workflow.chatConfig as AppChatConfigType
    });

    return globalVariables.map((item) => ({
      ...item,
      label: t(item.label as any)
    }));
  }, [t, workflow]);

  const [selectTemplateData, setSelectTemplateData] = useState<{
    title: string;
    templates: PromptTemplateItem[];
  }>();
  const quoteTemplateVariables = useMemo(
    () => [
      {
        key: 'id',
        label: 'id',
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
        key: 'updateTime',
        label: t('app:source_updateTime'),
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
      ...(aiChatQuoteRole === 'user'
        ? [
            {
              key: 'question',
              label: t('common:core.module.input.label.user question'),
              icon: 'core/app/simpleMode/variable'
            }
          ]
        : []),
      ...variables
    ],
    [t, variables, aiChatQuoteRole]
  );

  const onSubmit = useCallback(
    (data: { quoteTemplate: string; quotePrompt: string; quoteRole: AiChatQuoteRoleType }) => {
      // 三条引用配置记录一次提交：已存在的按模板整条替换，缺失的追加，与旧 replaceInput 一致。
      // 基线取派发瞬间的 inputs，避免覆盖同一 tick 内的其他写入。
      nodeActions?.updateNode((current) => {
        const nextInputs = [...current.inputs];
        (
          [
            { record: AiChatQuoteRole, value: data.quoteRole || 'system' },
            { record: AiChatQuoteTemplate, value: data.quoteTemplate },
            { record: AiChatQuotePrompt, value: data.quotePrompt }
          ] as const
        ).forEach(({ record, value }) => {
          const index = nextInputs.findIndex((input) => input.key === record.key);
          if (index >= 0) nextInputs[index] = { ...record, value };
          else nextInputs.push({ ...record, value });
        });
        return { inputs: nextInputs };
      });

      onClose();
    },
    [nodeActions, onClose]
  );

  const quotePromptTemplates =
    aiChatQuoteRole === 'user' ? Prompt_userQuotePromptList : Prompt_systemQuotePromptList;

  return (
    <>
      <MyModal
        isOpen
        iconSrc={'modal/edit'}
        title={t('workflow:Quote_prompt_setting')}
        w={'100%'}
        h={['90vh', '85vh']}
        maxW={['90vw', '700px']}
        isCentered
      >
        <ModalBody flex={'1 0 0'} overflow={'auto'}>
          <Flex {...LabelStyles} alignItems={'center'}>
            <FormLabel>{t('workflow:dataset_quote_role')}</FormLabel>
            <QuestionTip label={t('workflow:dataset_quote_role_tip')} ml={1} mr={5} />
            <MySelect<AiChatQuoteRoleType>
              value={aiChatQuoteRole}
              list={[
                {
                  label: 'System',
                  value: 'system',
                  description: t('workflow:dataset_quote_role_system_option_desc')
                },
                {
                  label: 'User',
                  value: 'user',
                  description: t('workflow:dataset_quote_role_user_option_desc')
                }
              ]}
              onChange={(e) => {
                setValue('quoteRole', e);
              }}
            />
            <Box ml={5}>
              {aiChatQuoteRole === 'user' ? (
                <LightTip text={t('workflow:quote_role_user_tip')} />
              ) : (
                <LightTip text={t('workflow:quote_role_system_tip')} />
              )}
            </Box>
          </Flex>
          <Box mt={4}>
            <Flex {...LabelStyles} mb={1} alignItems={'center'}>
              <FormLabel>{t('common:core.app.Quote templates')}</FormLabel>
              <QuestionTip
                ml={1}
                label={t('workflow:quote_content_tip', {
                  default: getQuoteTemplate(nodeVersion)
                })}
              />
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
                {t('common:select_template')}
              </Box>
            </Flex>

            <PromptEditor
              variables={quoteTemplateVariables}
              minH={160}
              title={t('common:core.app.Quote templates')}
              placeholder={t('workflow:quote_content_placeholder')}
              value={aiChatQuoteTemplate}
              onChange={(e) => {
                setValue('quoteTemplate', e);
              }}
            />
          </Box>
          <Box mt={4}>
            <Flex {...LabelStyles} mb={1} alignItems={'center'}>
              <FormLabel>{t('common:core.app.Quote prompt')}</FormLabel>
              <QuestionTip
                ml={1}
                maxW={600}
                label={t('workflow:quote_prompt_tip', {
                  default: getQuotePrompt(nodeVersion, aiChatQuoteRole)
                })}
              />
              <LightTip ml={4} text={t('workflow:quote_cite_tip')} />
            </Flex>
            <PromptEditor
              variables={quotePromptVariables}
              title={t('common:core.app.Quote prompt')}
              minH={300}
              placeholder={t('workflow:quote_prompt_tip', {
                default: getQuotePrompt(nodeVersion, aiChatQuoteRole)
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
            {t('common:Close')}
          </Button>
          <Button onClick={handleSubmit(onSubmit)}>{t('common:Confirm')}</Button>
        </ModalFooter>
      </MyModal>
      {/* Prompt template */}
      {!!selectTemplateData && (
        <PromptTemplate
          title={selectTemplateData.title}
          templates={selectTemplateData.templates}
          onClose={() => setSelectTemplateData(undefined)}
          onSuccess={(e) => {
            const quoteVal = e.value;

            const promptVal = quotePromptTemplates.find((item) => item.title === e.title)?.value!;

            setValue('quoteTemplate', Object.values(quoteVal)[0]);
            setValue('quotePrompt', Object.values(promptVal)[0]);
          }}
        />
      )}
    </>
  );
};

const SettingQuotePrompt = (props: RenderInputProps) => {
  const { t } = useSafeTranslation();
  const { isOpen, onOpen, onClose } = useDisclosure();

  const Render = useMemo(() => {
    return (
      <>
        <Flex className="nodrag" cursor={'default'} alignItems={'center'} position={'relative'}>
          <FormLabel position={'relative'} color={'myGray.600'} fontWeight={'medium'}>
            {t('common:core.module.Dataset quote.label')}
          </FormLabel>
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
        <Box mt={3}>
          <Reference {...props} />
        </Box>

        {isOpen && <EditModal {...props} onClose={onClose} />}
      </>
    );
  }, [isOpen, onClose, onOpen, props, t]);

  return Render;
};

export default React.memo(SettingQuotePrompt);
