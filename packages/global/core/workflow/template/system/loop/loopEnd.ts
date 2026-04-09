import { i18nT } from '../../../../../../web/i18n/utils';
import {
  FlowNodeTemplateTypeEnum,
  NodeInputKeyEnum,
  WorkflowIOValueTypeEnum
} from '../../../constants';
import { FlowNodeInputTypeEnum, FlowNodeTypeEnum } from '../../../node/constant';
import { type FlowNodeTemplateType } from '../../../type/node';

export const LoopEndNode: FlowNodeTemplateType = {
  id: FlowNodeTypeEnum.nestedEnd,
  templateType: FlowNodeTemplateTypeEnum.systemInput,
  flowNodeType: FlowNodeTypeEnum.nestedEnd,
  showSourceHandle: false,
  showTargetHandle: true,
  unique: true,
  forbidDelete: true,
  avatar: 'core/workflow/template/loopEnd',
  avatarLinear: 'core/workflow/template/loopEndLinear',
  colorSchema: 'violetDeep',
  name: i18nT('workflow:loop_end'),
  showStatus: false,
  inputs: [
    {
      key: NodeInputKeyEnum.nestedEndInput,
      renderTypeList: [FlowNodeInputTypeEnum.reference],
      valueType: WorkflowIOValueTypeEnum.any,
      label: '',
      required: true,
      value: []
    }
  ],
  outputs: []
};
