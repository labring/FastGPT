import { FlowNodeTemplateTypeEnum } from '../../constants';
import { FlowNodeTypeEnum } from '../../node/constant';
import { type FlowNodeTemplateType } from '../../type/node';
import { getHandleConfig } from '../utils';

export const RunToolSetNode: FlowNodeTemplateType = {
  id: FlowNodeTypeEnum.toolSet,
  templateType: FlowNodeTemplateTypeEnum.other,
  flowNodeType: FlowNodeTypeEnum.toolSet,
  sourceHandle: getHandleConfig(false, false, false, false),
  targetHandle: getHandleConfig(false, false, false, false),
  intro: '',
  name: '',
  showStatus: false,
  isTool: true,
  inputs: [],
  outputs: []
};
