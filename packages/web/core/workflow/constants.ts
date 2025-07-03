import { FlowNodeTemplateTypeEnum } from '@fastgpt/global/core/workflow/constants';
import { i18nT } from '../../i18n/utils';
import type { PluginGroupSchemaType, TGroupType } from '../../../service/core/app/plugin/type';
import { AppTemplateTypeEnum } from '@fastgpt/global/core/app/constants';
import { type TemplateTypeSchemaType } from '@fastgpt/global/core/app/type';

export const systemPluginTemplateList: TGroupType[] = [
  {
    typeId: FlowNodeTemplateTypeEnum.tools,
    typeName: i18nT('app:tool_type_tools')
  },
  {
    typeId: FlowNodeTemplateTypeEnum.search,
    typeName: i18nT('app:tool_type_search')
  },
  {
    typeId: FlowNodeTemplateTypeEnum.multimodal,
    typeName: i18nT('app:tool_type_multimodal')
  },
  {
    typeId: FlowNodeTemplateTypeEnum.productivity,
    typeName: i18nT('app:tool_type_productivity')
  },
  {
    typeId: FlowNodeTemplateTypeEnum.scientific,
    typeName: i18nT('app:tool_type_scientific')
  },
  {
    typeId: FlowNodeTemplateTypeEnum.finance,
    typeName: i18nT('app:tool_type_finance')
  },
  {
    typeId: FlowNodeTemplateTypeEnum.design,
    typeName: i18nT('app:tool_type_design')
  },
  {
    typeId: FlowNodeTemplateTypeEnum.news,
    typeName: i18nT('app:tool_type_news')
  },
  {
    typeId: FlowNodeTemplateTypeEnum.entertainment,
    typeName: i18nT('app:tool_type_entertainment')
  },
  {
    typeId: FlowNodeTemplateTypeEnum.communication,
    typeName: i18nT('app:tool_type_communication')
  },
  {
    typeId: FlowNodeTemplateTypeEnum.social,
    typeName: i18nT('app:tool_type_social')
  },
  {
    typeId: FlowNodeTemplateTypeEnum.other,
    typeName: i18nT('common:Other')
  }
];

export const workflowNodeTemplateList: {
  type: string;
  label: string;
}[] = [
  {
    type: FlowNodeTemplateTypeEnum.systemInput,
    label: i18nT('common:core.module.template.System input module')
  },
  {
    type: FlowNodeTemplateTypeEnum.ai,
    label: i18nT('common:core.module.template.AI function')
  },
  {
    type: FlowNodeTemplateTypeEnum.interactive,
    label: i18nT('common:core.workflow.template.Interactive')
  },

  ...systemPluginTemplateList.map((item) => ({
    type: item.typeId,
    label: item.typeName
  })),

  {
    type: FlowNodeTemplateTypeEnum.teamApp,
    label: ''
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
    typeName: i18nT('common:templateTags.Writing'),
    typeId: AppTemplateTypeEnum.writing,
    typeOrder: 0
  },
  {
    typeName: i18nT('common:templateTags.Image_generation'),
    typeId: AppTemplateTypeEnum.imageGeneration,
    typeOrder: 1
  },
  {
    typeName: i18nT('common:templateTags.Web_search'),
    typeId: AppTemplateTypeEnum.webSearch,
    typeOrder: 2
  },
  {
    typeName: i18nT('common:templateTags.Roleplay'),
    typeId: AppTemplateTypeEnum.roleplay,
    typeOrder: 3
  },
  {
    typeName: i18nT('common:templateTags.Office_services'),
    typeId: AppTemplateTypeEnum.officeServices,
    typeOrder: 4
  }
];
