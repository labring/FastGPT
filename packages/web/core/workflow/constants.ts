import { FlowNodeTemplateTypeEnum } from '@fastgpt/global/core/workflow/constants';
import { i18nT } from '../../i18n/utils';
import type { SystemToolGroupSchemaType } from '../../../service/core/app/plugin/type';
import { AppTemplateTypeEnum } from '@fastgpt/global/core/app/constants';
import { type TemplateTypeSchemaType } from '@fastgpt/global/core/app/type';

export const workflowSystemNodeTemplateList: {
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
  {
    type: FlowNodeTemplateTypeEnum.tools,
    label: i18nT('app:tool_type_tools')
  },
  {
    type: FlowNodeTemplateTypeEnum.other,
    label: i18nT('common:Other')
  }
];

export const defaultGroup: SystemToolGroupSchemaType = {
  groupId: 'systemPlugin',
  groupAvatar: 'core/app/type/pluginLight',
  groupName: i18nT('common:core.module.template.System Plugin'),
  groupOrder: 0,
  groupTypes: [] // from getPluginGroups
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
