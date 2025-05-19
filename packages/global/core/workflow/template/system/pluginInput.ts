import { i18nT } from '../../../../../web/i18n/utils';
import { FlowNodeTemplateTypeEnum } from '../../constants';
import { FlowNodeTypeEnum } from '../../node/constant';
import { FlowNodeTemplateType } from '../../type/node';
import { getHandleConfig } from '../utils';

export const PluginInputModule: FlowNodeTemplateType = {
  id: FlowNodeTypeEnum.pluginInput,
  templateType: FlowNodeTemplateTypeEnum.systemInput,
  flowNodeType: FlowNodeTypeEnum.pluginInput,
  sourceHandle: getHandleConfig(false, true, false, false),
  targetHandle: getHandleConfig(false, false, false, false),
  unique: true,
  forbidDelete: true,
  avatar: 'core/workflow/template/workflowStart',
  name: i18nT('workflow:plugin_input'),
  intro: i18nT('workflow:intro_plugin_input'),
  showStatus: false,
  version: '481',
  inputs: [],
  outputs: []
};
