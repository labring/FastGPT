import { FlowNodeInputTypeEnum, FlowNodeTypeEnum } from '../../../../node/constant';
import { type FlowNodeTemplateType } from '../../../../type/node';
import {
  FlowNodeTemplateTypeEnum,
  NodeInputKeyEnum,
  WorkflowIOValueTypeEnum
} from '../../../../constants';
import { i18nT } from '../../../../../../../web/i18n/utils';

export const LoopProEndNode: FlowNodeTemplateType = {
  id: FlowNodeTypeEnum.loopProEnd,
  templateType: FlowNodeTemplateTypeEnum.systemInput,
  flowNodeType: FlowNodeTypeEnum.loopProEnd,
  showSourceHandle: false,
  showTargetHandle: true,
  unique: false,
  forbidDelete: true,
  avatar: 'core/workflow/template/loopProEnd',
  avatarLinear: 'core/workflow/template/loopEndLinear',
  colorSchema: 'workflowLoop',
  name: i18nT('workflow:loopPro_end'),
  intro: i18nT('workflow:loopPro_end_intro'),
  showStatus: false,
  inputs: [
    {
      key: NodeInputKeyEnum.loopEndInput,
      renderTypeList: [FlowNodeInputTypeEnum.hidden],
      valueType: WorkflowIOValueTypeEnum.any,
      label: '',
      required: false,
      value: undefined
    }
  ],
  outputs: []
};
