import {
  chatHistoryValueDesc,
  FlowNodeInputTypeEnum,
  FlowNodeOutputTypeEnum,
  FlowNodeTypeEnum
} from '../../../node/constant';
import { type FlowNodeTemplateType } from '../../../type/node';
import {
  WorkflowIOValueTypeEnum,
  NodeInputKeyEnum,
  NodeOutputKeyEnum,
  FlowNodeTemplateTypeEnum
} from '../../../constants';
import {
  Input_Template_SettingAiModel,
  Input_Template_Dataset_Quote,
  Input_Template_History,
  Input_Template_System_Prompt,
  Input_Template_UserChatInput,
  Input_Template_File_Link
} from '../../input';
import { i18nT } from '../../../../../../web/i18n/utils';

export const AgentNode: FlowNodeTemplateType = {
  id: FlowNodeTypeEnum.agent,
  flowNodeType: FlowNodeTypeEnum.agent,
  templateType: FlowNodeTemplateTypeEnum.ai,
  showSourceHandle: true,
  showTargetHandle: true,
  avatar: 'core/workflow/template/agent',
  name: 'Agent',
  intro: 'Agent',
  showStatus: true,
  isTool: true,
  version: '4.13.0',
  catchError: false,
  inputs: [
    {
      key: NodeInputKeyEnum.aiModel,
      renderTypeList: [FlowNodeInputTypeEnum.selectLLMModel], // Set in the pop-up window
      label: i18nT('common:core.module.input.label.aiModel'),
      valueType: WorkflowIOValueTypeEnum.string
    },
    Input_Template_System_Prompt,
    Input_Template_History,
    {
      key: NodeInputKeyEnum.modelConfig,
      renderTypeList: [FlowNodeInputTypeEnum.hidden], // Set in the pop-up window
      label: '',
      valueType: WorkflowIOValueTypeEnum.object
    },
    {
      key: NodeInputKeyEnum.subApps,
      renderTypeList: [FlowNodeInputTypeEnum.hidden], // Set in the pop-up window
      label: '',
      valueType: WorkflowIOValueTypeEnum.object
    },
    { ...Input_Template_UserChatInput, toolDescription: i18nT('workflow:user_question') }
  ],
  outputs: [
    {
      id: NodeOutputKeyEnum.history,
      key: NodeOutputKeyEnum.history,
      required: true,
      label: i18nT('common:core.module.output.label.New context'),
      description: i18nT('common:core.module.output.description.New context'),
      valueType: WorkflowIOValueTypeEnum.chatHistory,
      valueDesc: chatHistoryValueDesc,
      type: FlowNodeOutputTypeEnum.static
    },
    {
      id: NodeOutputKeyEnum.answerText,
      key: NodeOutputKeyEnum.answerText,
      required: true,
      label: i18nT('common:core.module.output.label.Ai response content'),
      description: i18nT('common:core.module.output.description.Ai response content'),
      valueType: WorkflowIOValueTypeEnum.string,
      type: FlowNodeOutputTypeEnum.static
    }
  ]
};
