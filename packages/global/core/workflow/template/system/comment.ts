import { FlowNodeTypeEnum } from '../../node/constant';
import { FlowNodeTemplateType } from '../../type/node.d';
import {
  FlowNodeTemplateTypeEnum,
  NodeInputKeyEnum,
  WorkflowIOValueTypeEnum
} from '../../constants';
import { getHandleConfig } from '../utils';

export const CommentNode: FlowNodeTemplateType = {
  id: FlowNodeTypeEnum.comment,
  templateType: FlowNodeTemplateTypeEnum.systemInput,
  flowNodeType: FlowNodeTypeEnum.comment,
  sourceHandle: getHandleConfig(false, false, false, false),
  targetHandle: getHandleConfig(false, false, false, false),
  avatar: '',
  name: '',
  intro: '',
  version: '4811',
  inputs: [
    {
      key: NodeInputKeyEnum.commentText,
      renderTypeList: [],
      valueType: WorkflowIOValueTypeEnum.string,
      label: '',
      value: ''
    },
    {
      key: NodeInputKeyEnum.commentSize,
      renderTypeList: [],
      valueType: WorkflowIOValueTypeEnum.object,
      label: '',
      value: {
        width: 240,
        height: 140
      }
    }
  ],
  outputs: []
};
