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
  unique: true,
  forbidDelete: true,
  avatar: 'core/workflow/template/pluginOutput',
  name: i18nT('workflow:template.plugin_output'),
  intro: i18nT('workflow:intro_custom_plugin_output'),
  showStatus: false,
  inputs: [],
  outputs: []
};
