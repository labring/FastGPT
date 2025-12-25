import { FlowNodeInputTypeEnum, FlowNodeTypeEnum } from '../../node/constant';
import { type FlowNodeTemplateType } from '../../type/node.d';
import {
  WorkflowIOValueTypeEnum,
  NodeInputKeyEnum,
  FlowNodeTemplateTypeEnum
} from '../../constants';
import { i18nT } from '../../../../../web/i18n/utils';

export const CustomFeedbackNode: FlowNodeTemplateType = {
  id: FlowNodeTypeEnum.customFeedback,
  templateType: FlowNodeTemplateTypeEnum.other,
  flowNodeType: FlowNodeTypeEnum.customFeedback,
  showSourceHandle: true,
  showTargetHandle: true,
  avatar: 'core/workflow/systemNode/customFeedback',
  avatarLinear: 'core/workflow/systemNode/customFeedbackLinear',
  colorSchema: 'yellowGreen',
  name: i18nT('workflow:custom_feedback'),
  intro: i18nT('workflow:intro_custom_feedback'),
  courseUrl: '/docs/introduction/guide/dashboard/workflow/custom_feedback/',
  inputs: [
    {
      key: NodeInputKeyEnum.textareaInput,
      renderTypeList: [FlowNodeInputTypeEnum.textarea, FlowNodeInputTypeEnum.reference],
      valueType: WorkflowIOValueTypeEnum.string,
      required: true,
      label: i18nT('workflow:feedback_text')
    }
  ],
  outputs: []
};
