import { ToolTypeEnum } from '../../constants';
import { FlowNodeTypeEnum } from '../../node/constant';
import { type FlowNodeTemplateType } from '../../type/node';

export const RunToolNode: FlowNodeTemplateType = {
  id: FlowNodeTypeEnum.tool,
  templateType: ToolTypeEnum.other,
  flowNodeType: FlowNodeTypeEnum.tool,
  showSourceHandle: true,
  showTargetHandle: true,
  intro: '',
  name: '',
  showStatus: false,
  isTool: true,
  inputs: [],
  outputs: []
};
