import { FlowNodeTemplateTypeEnum } from '../../constants';
import { FlowNodeTypeEnum } from '../../node/constant';
import { type FlowNodeTemplateType } from '../../type/node';
import { getHandleConfig } from '../utils';

export const RunPluginModule: FlowNodeTemplateType = {
  id: FlowNodeTypeEnum.pluginModule,
  templateType: FlowNodeTemplateTypeEnum.other,
  flowNodeType: FlowNodeTypeEnum.pluginModule,
  sourceHandle: getHandleConfig(true, true, true, true),
  targetHandle: getHandleConfig(true, true, true, true),
  intro: '',
  name: '',
  showStatus: false,
  isTool: true,
  inputs: [], // [{key:'pluginId'},...]
  outputs: []
};
