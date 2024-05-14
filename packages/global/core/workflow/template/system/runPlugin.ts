import { FlowNodeTemplateTypeEnum } from '../../constants';
import { FlowNodeTypeEnum } from '../../node/constant';
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
  version: '481',
  inputs: [], // [{key:'pluginId'},...]
  outputs: []
};
