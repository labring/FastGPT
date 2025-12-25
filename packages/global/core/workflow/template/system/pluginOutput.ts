import { i18nT } from '../../../../../web/i18n/utils';
import { FlowNodeTemplateTypeEnum } from '../../constants';
import { FlowNodeTypeEnum } from '../../node/constant';
import { type FlowNodeTemplateType } from '../../type/node';
import { NodeGradients } from '../../node/gradient';

export const PluginOutputModule: FlowNodeTemplateType = {
  id: FlowNodeTypeEnum.pluginOutput,
  templateType: FlowNodeTemplateTypeEnum.systemInput,
  flowNodeType: FlowNodeTypeEnum.pluginOutput,
  showSourceHandle: false,
  showTargetHandle: true,
  avatar: 'core/workflow/systemNode/pluginOutput',
  avatarLinear: 'core/workflow/systemNode/pluginOutputLinear',
  gradient: NodeGradients.blue,
  name: i18nT('workflow:template.plugin_output'),
  intro: i18nT('workflow:intro_custom_plugin_output'),
  showStatus: false,
  inputs: [],
  outputs: []
};
