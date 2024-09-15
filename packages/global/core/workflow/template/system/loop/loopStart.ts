import { FlowNodeInputTypeEnum, FlowNodeTypeEnum } from '../../../node/constant';
import { FlowNodeTemplateType } from '../../../type/node.d';
import {
  FlowNodeTemplateTypeEnum,
  NodeInputKeyEnum,
  WorkflowIOValueTypeEnum
} from '../../../constants';
import { getHandleConfig } from '../../utils';
import { i18nT } from '../../../../../../web/i18n/utils';

export const LoopStartNode: FlowNodeTemplateType = {
  id: FlowNodeTypeEnum.loopStart,
  templateType: FlowNodeTemplateTypeEnum.systemInput,
  flowNodeType: FlowNodeTypeEnum.loopStart,
  sourceHandle: getHandleConfig(false, true, false, false),
  targetHandle: getHandleConfig(false, false, false, false),
  avatar: 'core/workflow/template/loopStart',
  name: i18nT('workflow:loop_start'),
  unique: true,
  forbidDelete: true,
  showStatus: false,
  version: '4811',
  inputs: [
    {
      key: NodeInputKeyEnum.loopStartInput,
      renderTypeList: [FlowNodeInputTypeEnum.hidden],
      valueType: WorkflowIOValueTypeEnum.any,
      label: '',
      required: true,
      value: ''
    }
  ],
  outputs: []
};
