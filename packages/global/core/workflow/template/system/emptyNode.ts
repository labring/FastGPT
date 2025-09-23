import { FlowNodeTypeEnum } from '../../node/constant';
import { type FlowNodeTemplateType } from '../../type/node';
import { FlowNodeTemplateTypeEnum } from '../../constants';

export const EmptyNode: FlowNodeTemplateType = {
  id: FlowNodeTypeEnum.emptyNode,
  templateType: FlowNodeTemplateTypeEnum.systemInput,
  flowNodeType: FlowNodeTypeEnum.emptyNode,
  showSourceHandle: false,
  showTargetHandle: false,
  avatar: '',
  name: '',
  intro: '',
  version: '481',
  inputs: [],
  outputs: []
};
