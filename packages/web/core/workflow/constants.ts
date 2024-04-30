import { FlowNodeTemplateTypeEnum } from '@fastgpt/global/core/workflow/constants';
import { nodeTemplateListType } from '@fastgpt/global/core/workflow/type';
import { TFunction } from 'next-i18next';

export const workflowNodeTemplateList = (t: TFunction): nodeTemplateListType => [
  {
    type: FlowNodeTemplateTypeEnum.systemInput,
    label: t('core.module.template.System input module'),
    list: []
  },
  {
    type: FlowNodeTemplateTypeEnum.textAnswer,
    label: t('core.module.template.Response module'),
    list: []
  },
  {
    type: FlowNodeTemplateTypeEnum.functionCall,
    label: t('core.module.template.Function module'),
    list: []
  },
  {
    type: FlowNodeTemplateTypeEnum.tools,
    label: t('core.module.template.Tool module'),
    list: []
  },
  {
    type: FlowNodeTemplateTypeEnum.externalCall,
    label: t('core.module.template.External module'),
    list: []
  },
  {
    type: FlowNodeTemplateTypeEnum.personalPlugin,
    label: '',
    list: []
  },
  {
    type: FlowNodeTemplateTypeEnum.other,
    label: t('common.Other'),
    list: []
  }
];
