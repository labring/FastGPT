import {
  chatHistoryValueDesc,
  FlowNodeInputTypeEnum,
  FlowNodeOutputTypeEnum,
  FlowNodeTypeEnum
} from '../../../../node/constant';
import { FlowNodeTemplateType } from '../../../../type/node';
import {
  WorkflowIOValueTypeEnum,
  NodeInputKeyEnum,
  NodeOutputKeyEnum,
  FlowNodeTemplateTypeEnum
} from '../../../../constants';
import { Input_Template_History, Input_Template_UserChatInput } from '../../../input';
import { getHandleConfig } from '../../../utils';
import { i18nT } from '../../../../../../../web/i18n/utils';

export const RunAppModule: FlowNodeTemplateType = {
  id: FlowNodeTypeEnum.runApp,
  templateType: FlowNodeTemplateTypeEnum.tools,
  flowNodeType: FlowNodeTypeEnum.runApp,
  sourceHandle: getHandleConfig(true, true, true, true),
  targetHandle: getHandleConfig(true, true, true, true),
  avatar: 'core/workflow/template/runApp',
  name: i18nT('workflow:application_call'),
  intro: i18nT('workflow:select_another_application_to_call'),
  showStatus: true,
  version: '481',
  isTool: true,
  inputs: [
    {
      key: NodeInputKeyEnum.runAppSelectApp,
      renderTypeList: [FlowNodeInputTypeEnum.selectApp, FlowNodeInputTypeEnum.reference],
      valueType: WorkflowIOValueTypeEnum.selectApp,
      label: i18nT('workflow:select_an_application'),
      description: i18nT('workflow:choose_another_application_to_call'),
      required: true
    },
    Input_Template_History,
    {
      ...Input_Template_UserChatInput,
      toolDescription: i18nT('workflow:user_question')
    }
  ],
  outputs: [
    {
      id: NodeOutputKeyEnum.history,
      key: NodeOutputKeyEnum.history,
      label: i18nT('workflow:new_context'),
      description: i18nT('workflow:append_application_reply_to_history_as_new_context'),
      valueType: WorkflowIOValueTypeEnum.chatHistory,
      valueDesc: chatHistoryValueDesc,
      required: true,
      type: FlowNodeOutputTypeEnum.static
    },
    {
      id: NodeOutputKeyEnum.answerText,
      key: NodeOutputKeyEnum.answerText,
      label: i18nT('workflow:reply_text'),
      description: i18nT('workflow:trigger_after_application_completion'),
      valueType: WorkflowIOValueTypeEnum.string,
      type: FlowNodeOutputTypeEnum.static
    }
  ]
};
