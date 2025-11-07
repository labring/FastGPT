import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { i18nT } from '@fastgpt/web/i18n/utils';

export const createAppTypeMap = {
  [AppTypeEnum.workflow]: {
    type: AppTypeEnum.workflow,
    icon: 'core/app/type/workflowFill',
    title: i18nT('app:type.Workflow bot'),
    intro: i18nT('app:type_workflow_intro'),
    description: i18nT('app:type_workflow_description'),
    imgUrl: '/imgs/app/workflowPreview.svg'
  },
  [AppTypeEnum.simple]: {
    type: AppTypeEnum.simple,
    icon: 'core/app/simpleBot',
    title: i18nT('app:type.Chat_Agent'),
    intro: i18nT('app:type_simple_intro'),
    description: i18nT('app:type_simple_description'),
    imgUrl: '/imgs/app/simpleAgentPreview.svg'
  },
  [AppTypeEnum.workflowTool]: {
    type: AppTypeEnum.workflowTool,
    icon: 'core/app/type/pluginFill',
    title: i18nT('app:toolType_workflow'),
    intro: i18nT('app:type_plugin_intro'),
    description: i18nT('app:type_plugin_description'),
    imgUrl: '/imgs/app/pluginPreview.svg'
  },
  [AppTypeEnum.mcpToolSet]: {
    type: AppTypeEnum.mcpToolSet,
    icon: 'core/app/type/mcpToolsFill',
    title: i18nT('app:toolType_mcp'),
    intro: i18nT('app:type_mcp_intro'),
    description: i18nT('app:type.Create mcp tools tip'),
    imgUrl: '/imgs/app/mcpToolsPreview.svg'
  },
  [AppTypeEnum.httpToolSet]: {
    type: AppTypeEnum.httpToolSet,
    icon: 'core/app/type/httpPluginFill',
    title: i18nT('app:toolType_http'),
    intro: i18nT('app:type_http_tool_set_intro'),
    description: i18nT('app:type.Create http toolset tip'),
    imgUrl: '/imgs/app/httpToolSetPreview.svg'
  }
};
