import { FlowNodeInputTypeEnum, FlowNodeTypeEnum } from '../../node/constant';
import { FlowNodeTemplateType } from '../../type/node.d';
import {
  WorkflowIOValueTypeEnum,
  FlowNodeTemplateTypeEnum,
  NodeInputKeyEnum
} from '../../constants';
import { getHandleConfig } from '../utils';
import { i18nT } from '../../../../../web/i18n/utils';

export const CustomFeedbackNode: FlowNodeTemplateType = {
  id: FlowNodeTypeEnum.customFeedback,
  templateType: FlowNodeTemplateTypeEnum.other,
  flowNodeType: FlowNodeTypeEnum.customFeedback,
  sourceHandle: getHandleConfig(true, true, true, true),
  targetHandle: getHandleConfig(true, true, true, true),
  avatar: 'core/workflow/template/customFeedback',
  name: i18nT('workflow:custom_feedback'),
  intro: i18nT('workflow:intro_custom_feedback'),
  courseUrl: '/docs/guide/workbench/workflow/custom_feedback/',
  version: '486',
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
