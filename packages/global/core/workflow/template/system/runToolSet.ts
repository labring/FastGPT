import { FlowNodeTemplateTypeEnum } from '../../constants';
import { FlowNodeTypeEnum } from '../../node/constant';
import { type FlowNodeTemplateType } from '../../type/node';

export const RunToolSetNode: FlowNodeTemplateType = {
  id: FlowNodeTypeEnum.toolSet,
  templateType: FlowNodeTemplateTypeEnum.other,
  flowNodeType: FlowNodeTypeEnum.toolSet,
  showSourceHandle: false,
  showTargetHandle: false,
  colorSchema: 'salmon',
  isTool: true,
  intro: '',
  name: '',
  showStatus: false,
  inputs: [],
  outputs: []
};
