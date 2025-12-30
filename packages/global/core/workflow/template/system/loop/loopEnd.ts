import { i18nT } from '../../../../../../web/i18n/utils';
import {
  FlowNodeTemplateTypeEnum,
  NodeInputKeyEnum,
  WorkflowIOValueTypeEnum
} from '../../../constants';
import { FlowNodeInputTypeEnum, FlowNodeTypeEnum } from '../../../node/constant';
import { type FlowNodeTemplateType } from '../../../type/node';

export const LoopEndNode: FlowNodeTemplateType = {
  id: FlowNodeTypeEnum.loopEnd,
  templateType: FlowNodeTemplateTypeEnum.systemInput,
  flowNodeType: FlowNodeTypeEnum.loopEnd,
  showSourceHandle: false,
  showTargetHandle: true,
  unique: true,
  forbidDelete: true,
  avatar: 'core/workflow/systemNode/loopEnd',
  avatarLinear: 'core/workflow/systemNode/loopEndLinear',
  colorSchema: 'violetDeep',
  name: i18nT('workflow:loop_end'),
  showStatus: false,
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
