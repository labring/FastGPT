import { FlowNodeTemplateTypeEnum } from '../../constants';
import { FlowNodeTypeEnum } from '../../node/constant';
import { type FlowNodeTemplateType } from '../../type/node';

export const RunAppNode: FlowNodeTemplateType = {
  id: FlowNodeTypeEnum.appModule,
  templateType: FlowNodeTemplateTypeEnum.other,
  flowNodeType: FlowNodeTypeEnum.appModule,
  showSourceHandle: true,
  showTargetHandle: true,
  colorSchema: 'skyBlue',
  intro: '',
  name: '',
  showStatus: false,
  isTool: false,
  inputs: [], // [{key:'pluginId'},...]
  outputs: []
};
