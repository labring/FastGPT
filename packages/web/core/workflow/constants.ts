import { FlowNodeTemplateTypeEnum } from '@fastgpt/global/core/workflow/constants';
import { i18nT } from '../../i18n/utils';

export const workflowNodeTemplateList = [
  {
    type: FlowNodeTemplateTypeEnum.systemInput,
    label: i18nT('common:core.module.template.System input module'),
    list: []
  },
  {
    type: FlowNodeTemplateTypeEnum.ai,
    label: i18nT('common:core.module.template.AI function'),
    list: []
  },
  {
    type: FlowNodeTemplateTypeEnum.search,
    label: i18nT('common:core.workflow.template.Search'),
    list: []
  },
  {
    type: FlowNodeTemplateTypeEnum.interactive,
    label: i18nT('common:core.workflow.template.Interactive'),
    list: []
  },
  {
    type: FlowNodeTemplateTypeEnum.multimodal,
    label: i18nT('common:core.workflow.template.Multimodal'),
    list: []
  },
  {
    type: FlowNodeTemplateTypeEnum.tools,
    label: i18nT('common:core.module.template.Tool module'),
    list: []
  },
  {
    type: FlowNodeTemplateTypeEnum.communication,
    label: i18nT('common:workflow.template.communication'),
    list: []
  },
  {
    type: FlowNodeTemplateTypeEnum.other,
    label: i18nT('common:common.Other'),
    list: []
  },
  {
    type: FlowNodeTemplateTypeEnum.teamApp,
    label: '',
    list: []
  }
];

export const systemPluginTemplateList: {
  typeId: string;
  typeName: string;
}[] = [
  {
    typeId: FlowNodeTemplateTypeEnum.tools,
    typeName: i18nT('common:navbar.Tools')
  },
  {
    typeId: FlowNodeTemplateTypeEnum.search,
    typeName: i18nT('common:common.Search')
  },
  {
    typeId: FlowNodeTemplateTypeEnum.multimodal,
    typeName: i18nT('common:core.workflow.template.Multimodal')
  },
  {
    typeId: FlowNodeTemplateTypeEnum.communication,
    typeName: i18nT('common:workflow.template.communication')
  },
  {
    typeId: FlowNodeTemplateTypeEnum.other,
    typeName: i18nT('common:common.Other')
  }
];
export const defaultGroup = {
  groupId: 'systemPlugin',
  groupAvatar: 'common/navbar/pluginLight',
  groupName: i18nT('common:core.module.template.System Plugin'),
  groupOrder: 0,
  groupTypes: systemPluginTemplateList
};
