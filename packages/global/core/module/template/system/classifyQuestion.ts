import {
  FlowNodeInputTypeEnum,
  FlowNodeOutputTypeEnum,
  FlowNodeTypeEnum
} from '../../node/constant';
import { FlowModuleTemplateType } from '../../type.d';
import { ModuleDataTypeEnum, ModuleInputKeyEnum, ModuleTemplateTypeEnum } from '../../constants';
import {
  Input_Template_History,
  Input_Template_TFSwitch,
  Input_Template_UserChatInput
} from '../input';

export const ClassifyQuestionModule: FlowModuleTemplateType = {
  id: FlowNodeTypeEnum.classifyQuestion,
  templateType: ModuleTemplateTypeEnum.functionCall,
  flowType: FlowNodeTypeEnum.classifyQuestion,
  avatar: '/imgs/module/cq.png',
  name: '问题分类',
  intro:
    '根据用户的历史记录和当前问题判断该次提问的类型。可以添加多组问题类型，下面是一个模板例子：\n类型1: 打招呼\n类型2: 关于 laf 通用问题\n类型3: 关于 laf 代码问题\n类型4: 其他问题',
  showStatus: true,
  inputs: [
    Input_Template_TFSwitch,
    {
      key: ModuleInputKeyEnum.aiModel,
      type: FlowNodeInputTypeEnum.selectChatModel,
      valueType: ModuleDataTypeEnum.string,
      label: '分类模型',
      required: true,
      showTargetInApp: false,
      showTargetInPlugin: false
    },
    {
      key: ModuleInputKeyEnum.aiSystemPrompt,
      type: FlowNodeInputTypeEnum.textarea,
      valueType: ModuleDataTypeEnum.string,
      value: '',
      label: '背景知识',
      description:
        '你可以添加一些特定内容的介绍，从而更好的识别用户的问题类型。这个内容通常是给模型介绍一个它不知道的内容。',
      placeholder: '例如: \n1. Laf 是一个云函数开发平台……\n2. Sealos 是一个集群操作系统',
      showTargetInApp: true,
      showTargetInPlugin: true
    },
    Input_Template_History,
    Input_Template_UserChatInput,
    {
      key: ModuleInputKeyEnum.agents,
      type: FlowNodeInputTypeEnum.custom,
      valueType: ModuleDataTypeEnum.any,
      label: '',
      value: [
        {
          value: '打招呼',
          key: 'fasw'
        },
        {
          value: '关于 xxx 的问题',
          key: 'fqsw'
        },
        {
          value: '其他问题',
          key: 'fesw'
        }
      ],
      showTargetInApp: false,
      showTargetInPlugin: false
    }
  ],
  outputs: [
    // custom output
    {
      key: 'fasw',
      label: '',
      type: FlowNodeOutputTypeEnum.hidden,
      targets: []
    },
    {
      key: 'fqsw',
      label: '',
      type: FlowNodeOutputTypeEnum.hidden,
      targets: []
    },
    {
      key: 'fesw',
      label: '',
      type: FlowNodeOutputTypeEnum.hidden,
      targets: []
    }
  ]
};
