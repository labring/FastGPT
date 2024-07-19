import { FlowNodeTemplateTypeEnum } from '@fastgpt/global/core/workflow/constants';
import { NodeTemplateListType } from '@fastgpt/global/core/workflow/type/node';
import { TFunction } from 'next-i18next';

export const workflowNodeTemplateList = (t: TFunction): NodeTemplateListType => [
  {
    type: FlowNodeTemplateTypeEnum.systemInput,
    label: t('common:core.module.template.System input module'),
    list: []
  },
  {
    type: FlowNodeTemplateTypeEnum.ai,
    label: t('common:core.module.template.AI function'),
    list: []
  },
  {
    type: FlowNodeTemplateTypeEnum.tools,
    label: t('common:core.module.template.Tool module'),
    list: []
  },
  {
    type: FlowNodeTemplateTypeEnum.search,
    label: t('core.workflow.template.Search'),
    list: []
  },
  {
    type: FlowNodeTemplateTypeEnum.multimodal,
    label: t('core.workflow.template.Multimodal'),
    list: []
  },
  {
    type: FlowNodeTemplateTypeEnum.other,
    label: t('common:common.Other'),
    list: []
  },
  {
    type: FlowNodeTemplateTypeEnum.teamApp,
    label: '',
    list: []
  }
];
