import { i18nT } from '../../../../../web/i18n/utils';
import { FlowNodeTemplateTypeEnum } from '../../constants';
import { FlowNodeTypeEnum } from '../../node/constant';
import { FlowNodeTemplateType } from '../../type/node';
import { getHandleConfig } from '../utils';

export const PluginOutputModule: FlowNodeTemplateType = {
  id: FlowNodeTypeEnum.pluginOutput,
  templateType: FlowNodeTemplateTypeEnum.systemInput,
  flowNodeType: FlowNodeTypeEnum.pluginOutput,
  sourceHandle: getHandleConfig(false, false, false, false),
  targetHandle: getHandleConfig(false, false, false, true),
  unique: true,
  forbidDelete: true,
  avatar: 'core/workflow/template/pluginOutput',
  name: i18nT('workflow:template.plugin_output'),
  intro: i18nT('workflow:intro_custom_plugin_output'),
  showStatus: false,
  version: '481',
  inputs: [],
  outputs: []
};
