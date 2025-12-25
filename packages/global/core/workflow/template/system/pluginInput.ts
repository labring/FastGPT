import { i18nT } from '../../../../../web/i18n/utils';
import { FlowNodeTemplateTypeEnum } from '../../constants';
import { FlowNodeTypeEnum } from '../../node/constant';
import { type FlowNodeTemplateType } from '../../type/node';

export const PluginInputModule: FlowNodeTemplateType = {
  id: FlowNodeTypeEnum.pluginInput,
  templateType: FlowNodeTemplateTypeEnum.systemInput,
  flowNodeType: FlowNodeTypeEnum.pluginInput,
  showSourceHandle: true,
  showTargetHandle: false,
  unique: true,
  forbidDelete: true,
  avatar: 'core/workflow/systemNode/workflowStart',
  avatarLinear: 'core/workflow/systemNode/workflowStartLinear',
  colorSchema: 'blue',
  name: i18nT('workflow:plugin_input'),
  intro: i18nT('workflow:intro_plugin_input'),
  showStatus: false,
  inputs: [],
  outputs: []
};
