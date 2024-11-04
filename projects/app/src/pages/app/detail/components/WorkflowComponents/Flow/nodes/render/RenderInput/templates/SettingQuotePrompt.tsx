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
  Prompt_userQuotePromptList,
  Prompt_QuoteTemplateList,
  Prompt_systemQuotePromptList
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
import type { AiChatQuoteRoleType } from '@fastgpt/global/core/workflow/template/system/aiChat/type';
import {
  AiChatQuotePrompt,
  AiChatQuoteRole,
  AiChatQuoteTemplate
} from '@fastgpt/global/core/workflow/template/system/aiChat';
import MySelect from '@fastgpt/web/components/common/MySelect';
import LightTip from '@fastgpt/web/components/common/LightTip';

const LabelStyles: BoxProps = {
  fontSize: ['sm', 'md']
};
const selectTemplateBtn: BoxProps = {
  color: 'primary.500',
  cursor: 'pointer'
};

const EditModal = ({ onClose, ...props }: RenderInputProps & { onClose: () => void }) => {
  const { inputs = [], nodeId } = props;
  const { t } = useTranslation();
  const onChangeNode = useContextSelector(WorkflowContext, (v) => v.onChangeNode);
  const nodeList = useContextSelector(WorkflowContext, (v) => v.nodeList);

  const { watch, setValue, handleSubmit } = useForm({
    defaultValues: {
      quoteTemplate:
        inputs.find((input) => input.key === NodeInputKeyEnum.aiChatQuoteTemplate)?.value || '',
      quotePrompt:
        inputs.find((input) => input.key === NodeInputKeyEnum.aiChatQuotePrompt)?.value || '',
      quoteRole: (inputs.find((input) => input.key === NodeInputKeyEnum.aiChatQuoteRole)?.value ||
        'system') as AiChatQuoteRoleType
    }
  });
  const aiChatQuoteTemplate = watch('quoteTemplate');
  const aiChatQuotePrompt = watch('quotePrompt');
  const aiChatQuoteRole = watch('quoteRole');
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
      onChangeNode({
        nodeId,
        type: 'replaceInput',
        key: NodeInputKeyEnum.aiChatQuoteRole,
        value: {
          ...AiChatQuoteRole,
          value: data.quoteRole || 'system'
        }
      });
      onChangeNode({
        nodeId,
        type: 'replaceInput',
        key: NodeInputKeyEnum.aiChatQuoteTemplate,
        value: {
          ...AiChatQuoteTemplate,
          value: data.quoteTemplate
        }
      });
      onChangeNode({
        nodeId,
        type: 'replaceInput',
        key: NodeInputKeyEnum.aiChatQuotePrompt,
        value: {
          ...AiChatQuotePrompt,
          value: data.quotePrompt
        }
      });

      onClose();
    },
    [nodeId, onChangeNode, onClose]
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
              onchange={(e) => {
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
            <Flex {...LabelStyles} mb={1}>
              <FormLabel>{t('common:core.app.Quote templates')}</FormLabel>
              <QuestionTip
                ml={1}
                label={t('workflow:quote_content_tip', {
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
            <Flex {...LabelStyles} mb={1}>
              <FormLabel>{t('common:core.app.Quote prompt')}</FormLabel>
              <QuestionTip
                ml={1}
                label={t('workflow:quote_prompt_tip', {
                  default: quotePromptTemplates[0].value
                })}
              ></QuestionTip>
            </Flex>
            <PromptEditor
              variables={quotePromptVariables}
              title={t('common:core.app.Quote prompt')}
              minH={300}
              placeholder={t('workflow:quote_prompt_tip', {
                default: quotePromptTemplates[0].value
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
      {/* Prompt template */}
      {!!selectTemplateData && (
        <PromptTemplate
          title={selectTemplateData.title}
          templates={selectTemplateData.templates}
          onClose={() => setSelectTemplateData(undefined)}
          onSuccess={(e) => {
            const quoteVal = e.value;

            const promptVal = quotePromptTemplates.find((item) => item.title === e.title)?.value;

            setValue('quoteTemplate', quoteVal);
            setValue('quotePrompt', promptVal);
          }}
        />
      )}
    </>
  );
};

const SettingQuotePrompt = (props: RenderInputProps) => {
  const { t } = useTranslation();
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
