import { i18nT } from '../../../../../../web/i18n/utils';
import {
  FlowNodeTemplateTypeEnum,
  NodeInputKeyEnum,
  WorkflowIOValueTypeEnum
} from '../../../constants';
import { FlowNodeInputTypeEnum, FlowNodeTypeEnum } from '../../../node/constant';
import { type FlowNodeTemplateType } from '../../../type/node';
import { NodeGradients } from '../../../node/gradient';

export const LoopEndNode: FlowNodeTemplateType = {
  id: FlowNodeTypeEnum.loopEnd,
  templateType: FlowNodeTemplateTypeEnum.systemInput,
  flowNodeType: FlowNodeTypeEnum.loopEnd,
  showSourceHandle: false,
  showTargetHandle: true,
  avatar: 'core/workflow/systemNode/loopEnd',
  avatarLinear: 'core/workflow/systemNode/loopEndLinear',
  gradient: NodeGradients.violetDeep,
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
