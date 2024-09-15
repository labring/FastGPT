import { i18nT } from '../../../../../../web/i18n/utils';
import {
  FlowNodeTemplateTypeEnum,
  NodeInputKeyEnum,
  WorkflowIOValueTypeEnum
} from '../../../constants';
import { FlowNodeInputTypeEnum, FlowNodeTypeEnum } from '../../../node/constant';
import { FlowNodeTemplateType } from '../../../type/node';
import { getHandleConfig } from '../../utils';

export const LoopEndNode: FlowNodeTemplateType = {
  id: FlowNodeTypeEnum.loopEnd,
  templateType: FlowNodeTemplateTypeEnum.systemInput,
  flowNodeType: FlowNodeTypeEnum.loopEnd,
  sourceHandle: getHandleConfig(false, false, false, false),
  targetHandle: getHandleConfig(false, false, false, true),
  unique: true,
  forbidDelete: true,
  avatar: 'core/workflow/template/loopEnd',
  name: i18nT('workflow:loop_end'),
  showStatus: false,
  version: '4811',
  inputs: [
    {
      key: NodeInputKeyEnum.loopEndInput,
      renderTypeList: [FlowNodeInputTypeEnum.reference],
      valueType: WorkflowIOValueTypeEnum.any,
      label: '',
      required: true,
      value: []
    }
  ],
  outputs: []
};
