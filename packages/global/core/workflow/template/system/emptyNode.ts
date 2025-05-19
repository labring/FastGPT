import { FlowNodeTypeEnum } from '../../node/constant';
import { FlowNodeTemplateType } from '../../type/node';
import { FlowNodeTemplateTypeEnum } from '../../constants';
import { getHandleConfig } from '../utils';

export const EmptyNode: FlowNodeTemplateType = {
  id: FlowNodeTypeEnum.emptyNode,
  templateType: FlowNodeTemplateTypeEnum.systemInput,
  flowNodeType: FlowNodeTypeEnum.emptyNode,
  sourceHandle: getHandleConfig(false, false, false, false),
  targetHandle: getHandleConfig(false, false, false, false),
  avatar: '',
  name: '',
  intro: '',
  version: '481',
  inputs: [],
  outputs: []
};
