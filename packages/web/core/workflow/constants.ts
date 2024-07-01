import { FlowNodeTemplateTypeEnum } from '@fastgpt/global/core/workflow/constants';
import { NodeTemplateListType } from '@fastgpt/global/core/workflow/type/node';
import { TFunction } from 'next-i18next';

export const workflowNodeTemplateList = (t: TFunction): NodeTemplateListType => [
  {
    type: FlowNodeTemplateTypeEnum.systemInput,
    label: t('core.module.template.System input module'),
    list: []
  },
  {
    type: FlowNodeTemplateTypeEnum.ai,
    label: t('core.module.template.AI function'),
    list: []
  },
  {
    type: FlowNodeTemplateTypeEnum.tools,
    label: t('core.module.template.Tool module'),
    list: []
  },
  {
    type: FlowNodeTemplateTypeEnum.other,
    label: t('common.Other'),
    list: []
  },
  {
    type: FlowNodeTemplateTypeEnum.teamApp,
    label: '',
    list: []
  }
];
