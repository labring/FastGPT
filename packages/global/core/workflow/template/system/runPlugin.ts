import { FlowNodeTemplateTypeEnum } from '../../constants';
import { FlowNodeTypeEnum, NodeVersions } from '../../node/constant';
import { FlowNodeTemplateType } from '../../type';
import { getHandleConfig } from '../utils';

export const RunPluginModule: FlowNodeTemplateType = {
  id: FlowNodeTypeEnum.pluginModule,
  templateType: FlowNodeTemplateTypeEnum.externalCall,
  flowNodeType: FlowNodeTypeEnum.pluginModule,
  sourceHandle: getHandleConfig(true, true, true, true),
  targetHandle: getHandleConfig(true, true, true, true),
  intro: '',
  name: '',
  showStatus: false,
  isTool: true,
  version: NodeVersions[FlowNodeTypeEnum.pluginModule],
  inputs: [], // [{key:'pluginId'},...]
  outputs: []
};
