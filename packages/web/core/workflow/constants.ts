import { FlowNodeTemplateTypeEnum } from '@fastgpt/global/core/workflow/constants';
import { i18nT } from '../../i18n/utils';
import type { PluginGroupSchemaType, TGroupType } from '../../../service/core/app/plugin/type';
import { AppTemplateTypeEnum } from '@fastgpt/global/core/app/constants';
import { TemplateTypeSchemaType } from '@fastgpt/global/core/app/type';

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

export const systemPluginTemplateList: TGroupType[] = [
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
export const defaultGroup: PluginGroupSchemaType = {
  groupId: 'systemPlugin',
  groupAvatar: 'core/app/type/pluginLight',
  groupName: i18nT('common:core.module.template.System Plugin'),
  groupOrder: 0,
  groupTypes: systemPluginTemplateList
};

export const defaultTemplateTypes: TemplateTypeSchemaType[] = [
  {
    typeName: i18nT('common:app.templateMarket.templateTags.Writing'),
    typeId: AppTemplateTypeEnum.writing,
    typeOrder: 0
  },
  {
    typeName: i18nT('common:app.templateMarket.templateTags.Image_generation'),
    typeId: AppTemplateTypeEnum.imageGeneration,
    typeOrder: 1
  },
  {
    typeName: i18nT('common:app.templateMarket.templateTags.Web_search'),
    typeId: AppTemplateTypeEnum.webSearch,
    typeOrder: 2
  },
  {
    typeName: i18nT('common:app.templateMarket.templateTags.Roleplay'),
    typeId: AppTemplateTypeEnum.roleplay,
    typeOrder: 3
  },
  {
    typeName: i18nT('common:app.templateMarket.templateTags.Office_services'),
    typeId: AppTemplateTypeEnum.officeServices,
    typeOrder: 4
  }
];
