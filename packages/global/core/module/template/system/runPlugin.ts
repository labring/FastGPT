import { FlowNodeTemplateTypeEnum } from '../../constants';
import { FlowNodeTypeEnum } from '../../node/constant';
import { FlowNodeTemplateType } from '../../type.d';

export const RunPluginModule: FlowNodeTemplateType = {
  id: FlowNodeTypeEnum.pluginModule,
  templateType: FlowNodeTemplateTypeEnum.externalCall,
  flowType: FlowNodeTypeEnum.pluginModule,
  intro: '',
  name: '',
  showStatus: false,
  isTool: true,
  inputs: [], // [{key:'pluginId'},...]
  outputs: []
};
