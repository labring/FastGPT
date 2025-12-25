import { FlowNodeOutputTypeEnum, FlowNodeTypeEnum } from '../../node/constant';
import { type FlowNodeTemplateType } from '../../type/node.d';
import {
  WorkflowIOValueTypeEnum,
  NodeOutputKeyEnum,
  FlowNodeTemplateTypeEnum
} from '../../constants';
import { Input_Template_UserChatInput } from '../input';
import { i18nT } from '../../../../../web/i18n/utils';
import { type FlowNodeOutputItemType } from '../../type/io';

export const userFilesInput: FlowNodeOutputItemType = {
  id: NodeOutputKeyEnum.userFiles,
  key: NodeOutputKeyEnum.userFiles,
  label: i18nT('app:workflow.user_file_input'),
  description: i18nT('app:workflow.user_file_input_desc'),
  type: FlowNodeOutputTypeEnum.static,
  valueType: WorkflowIOValueTypeEnum.arrayString
};

export const WorkflowStart: FlowNodeTemplateType = {
  id: FlowNodeTypeEnum.workflowStart,
  templateType: FlowNodeTemplateTypeEnum.systemInput,
  flowNodeType: FlowNodeTypeEnum.workflowStart,
  showSourceHandle: true,
  showTargetHandle: false,
  avatar: 'core/workflow/systemNode/workflowStart',
  avatarLinear: 'core/workflow/systemNode/workflowStartLinear',
  colorSchema: 'blue',
  name: i18nT('workflow:template.workflow_start'),
  intro: '',
  forbidDelete: true,
  unique: true,
  inputs: [{ ...Input_Template_UserChatInput, toolDescription: i18nT('workflow:user_question') }],
  outputs: [
    {
      id: NodeOutputKeyEnum.userChatInput,
      key: NodeOutputKeyEnum.userChatInput,
      label: i18nT('common:core.module.input.label.user question'),
      type: FlowNodeOutputTypeEnum.static,
      valueType: WorkflowIOValueTypeEnum.string
    }
  ]
};
