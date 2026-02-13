import { i18nT } from '../../../../../web/i18n/utils';
import { FlowNodeTemplateTypeEnum } from '../../constants';
import { FlowNodeTypeEnum } from '../../node/constant';
import { type FlowNodeTemplateType } from '../../type/node';

export const PluginOutputModule: FlowNodeTemplateType = {
  id: FlowNodeTypeEnum.pluginOutput,
  templateType: FlowNodeTemplateTypeEnum.systemInput,
  flowNodeType: FlowNodeTypeEnum.pluginOutput,
  showSourceHandle: false,
  showTargetHandle: true,
  avatar: 'core/workflow/template/pluginOutput',
  avatarLinear: 'core/workflow/template/pluginOutputLinear',
  colorSchema: 'blue',
  name: i18nT('workflow:template.plugin_output'),
  intro: i18nT('workflow:intro_custom_plugin_output'),
  showStatus: false,
  unique: true,
  forbidDelete: true,
  inputs: [],
  outputs: []
};
