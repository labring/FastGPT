import {
  FlowNodeInputTypeEnum,
  FlowNodeOutputTypeEnum,
  FlowNodeTypeEnum
} from '../../node/constant';
import { FlowModuleTemplateType } from '../../type.d';
import { ModuleDataTypeEnum, ModuleInputKeyEnum, ModuleOutputKeyEnum } from '../../constants';
import {
  Input_Template_History,
  Input_Template_TFSwitch,
  Input_Template_UserChatInput
} from '../input';
import { chatNodeSystemPromptTip } from '../tip';
import { Output_Template_Finish } from '../output';

export const AiChatModule: FlowModuleTemplateType = {
  id: FlowNodeTypeEnum.chatNode,
  flowType: FlowNodeTypeEnum.chatNode,
  logo: '/imgs/module/AI.png',
  name: 'AI 对话',
  intro: 'AI 大模型对话',
  showStatus: true,
  inputs: [
    Input_Template_TFSwitch,
    {
      key: ModuleInputKeyEnum.aiModel,
      type: FlowNodeInputTypeEnum.selectChatModel,
      label: '对话模型',
      required: true,
      valueCheck: (val) => !!val
    },
    // --- settings modal
    {
      key: ModuleInputKeyEnum.aiChatTemperature,
      type: FlowNodeInputTypeEnum.hidden, // Set in the pop-up window
      label: '温度',
      value: 0,
      min: 0,
      max: 10,
      step: 1,
      markList: [
        { label: '严谨', value: 0 },
        { label: '发散', value: 10 }
      ]
    },
    {
      key: ModuleInputKeyEnum.aiChatMaxToken,
      type: FlowNodeInputTypeEnum.hidden, // Set in the pop-up window
      label: '回复上限',
      value: 2000,
      min: 100,
      max: 4000,
      step: 50,
      markList: [
        { label: '100', value: 100 },
        {
          label: `${4000}`,
          value: 4000
        }
      ]
    },
    {
      key: ModuleInputKeyEnum.aiChatIsResponseText,
      type: FlowNodeInputTypeEnum.hidden,
      label: '返回AI内容',
      valueType: ModuleDataTypeEnum.boolean,
      value: true
    },
    {
      key: ModuleInputKeyEnum.aiChatQuoteTemplate,
      type: FlowNodeInputTypeEnum.hidden,
      label: '引用内容模板',
      valueType: ModuleDataTypeEnum.string,
      value: ''
    },
    {
      key: ModuleInputKeyEnum.aiChatQuotePrompt,
      type: FlowNodeInputTypeEnum.hidden,
      label: '引用内容提示词',
      valueType: ModuleDataTypeEnum.string,
      value: ''
    },
    {
      key: ModuleInputKeyEnum.aiChatSettingModal,
      type: FlowNodeInputTypeEnum.aiSettings,
      label: '',
      connected: false
    },
    // settings modal ---
    {
      key: ModuleInputKeyEnum.aiSystemPrompt,
      type: FlowNodeInputTypeEnum.textarea,
      label: '系统提示词',
      max: 300,
      valueType: ModuleDataTypeEnum.string,
      description: chatNodeSystemPromptTip,
      placeholder: chatNodeSystemPromptTip,
      value: ''
    },
    {
      key: ModuleInputKeyEnum.aiChatDatasetQuote,
      type: FlowNodeInputTypeEnum.target,
      label: '引用内容',
      description: "对象数组格式，结构：\n [{q:'问题',a:'回答'}]",
      valueType: ModuleDataTypeEnum.datasetQuote,
      connected: false
    },
    Input_Template_History,
    Input_Template_UserChatInput
  ],
  outputs: [
    {
      key: ModuleOutputKeyEnum.history,
      label: '新的上下文',
      description: '将本次回复内容拼接上历史记录，作为新的上下文返回',
      valueType: ModuleDataTypeEnum.chatHistory,
      type: FlowNodeOutputTypeEnum.source,
      targets: []
    },
    {
      key: ModuleOutputKeyEnum.answerText,
      label: 'AI回复',
      description: '将在 stream 回复完毕后触发',
      valueType: ModuleDataTypeEnum.string,
      type: FlowNodeOutputTypeEnum.source,
      targets: []
    },
    Output_Template_Finish
  ]
};
