import { FlowNodeTemplateTypeEnum } from '../../constants';
import { FlowNodeTypeEnum } from '../../node/constant';
import { type FlowNodeTemplateType } from '../../type/node';

export const RunPluginModule: FlowNodeTemplateType = {
  id: FlowNodeTypeEnum.pluginModule,
  templateType: FlowNodeTemplateTypeEnum.other,
  flowNodeType: FlowNodeTypeEnum.pluginModule,
  showSourceHandle: true,
  showTargetHandle: true,
  colorSchema: 'salmon',
  intro: '',
  name: '',
  showStatus: false,
  isTool: true,
  inputs: [], // [{key:'pluginId'},...]
  outputs: []
};
