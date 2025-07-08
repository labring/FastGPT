import { FlowNodeInputTypeEnum, FlowNodeTypeEnum } from '../../node/constant';
import { type FlowNodeTemplateType } from '../../type/node.d';
import {
  WorkflowIOValueTypeEnum,
  NodeInputKeyEnum,
  FlowNodeTemplateTypeEnum
} from '../../constants';
import { i18nT } from '../../../../../web/i18n/utils';

export const AssignedAnswerModule: FlowNodeTemplateType = {
  id: FlowNodeTypeEnum.answerNode,
  templateType: FlowNodeTemplateTypeEnum.tools,
  flowNodeType: FlowNodeTypeEnum.answerNode,
  showSourceHandle: true,
  showTargetHandle: true,
  avatar: 'core/workflow/template/reply',
  name: i18nT('workflow:assigned_reply'),
  intro: i18nT('workflow:intro_assigned_reply'),
  courseUrl: '/docs/guide/dashboard/workflow/reply/',
  isTool: true,
  inputs: [
    {
      key: NodeInputKeyEnum.answerText,
      renderTypeList: [FlowNodeInputTypeEnum.textarea, FlowNodeInputTypeEnum.reference],
      valueType: WorkflowIOValueTypeEnum.any,
      required: true,
      label: i18nT('common:core.module.input.label.Response content'),
      description: i18nT('common:core.module.input.description.Response content'),
      placeholder: i18nT('common:core.module.input.description.Response content')
    }
  ],
  outputs: []
};
