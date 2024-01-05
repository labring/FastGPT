import {
  FlowNodeInputTypeEnum,
  FlowNodeOutputTypeEnum,
  FlowNodeTypeEnum
} from '../../node/constant';
import { FlowModuleTemplateType } from '../../type.d';
import { ModuleIOValueTypeEnum, ModuleInputKeyEnum, ModuleTemplateTypeEnum } from '../../constants';
import {
  Input_Template_History,
  Input_Template_Switch,
  Input_Template_UserChatInput
} from '../input';
import { Output_Template_UserChatInput } from '../output';

export const ClassifyQuestionModule: FlowModuleTemplateType = {
  id: FlowNodeTypeEnum.classifyQuestion,
  templateType: ModuleTemplateTypeEnum.functionCall,
  flowType: FlowNodeTypeEnum.classifyQuestion,
  avatar: '/imgs/module/cq.png',
  name: '问题分类',
  intro: `根据用户的历史记录和当前问题判断该次提问的类型。可以添加多组问题类型，下面是一个模板例子：
类型1: 打招呼
类型2: 关于商品“使用”问题
类型3: 关于商品“购买”问题
类型4: 其他问题`,
  showStatus: true,
  inputs: [
    Input_Template_Switch,
    {
      key: ModuleInputKeyEnum.aiModel,
      type: FlowNodeInputTypeEnum.selectCQModel,
      valueType: ModuleIOValueTypeEnum.string,
      label: '分类模型',
      required: true,
      showTargetInApp: false,
      showTargetInPlugin: false
    },
    {
      key: ModuleInputKeyEnum.aiSystemPrompt,
      type: FlowNodeInputTypeEnum.textarea,
      valueType: ModuleIOValueTypeEnum.string,
      label: '背景知识',
      description:
        '你可以添加一些特定内容的介绍，从而更好的识别用户的问题类型。这个内容通常是给模型介绍一个它不知道的内容。',
      placeholder:
        '例如: \n1. AIGC（人工智能生成内容）是指使用人工智能技术自动或半自动地生成数字内容，如文本、图像、音乐、视频等。\n2. AIGC技术包括但不限于自然语言处理、计算机视觉、机器学习和深度学习。这些技术可以创建新内容或修改现有内容，以满足特定的创意、教育、娱乐或信息需求。',
      showTargetInApp: true,
      showTargetInPlugin: true
    },
    Input_Template_History,
    Input_Template_UserChatInput,
    {
      key: ModuleInputKeyEnum.agents,
      type: FlowNodeInputTypeEnum.custom,
      valueType: ModuleIOValueTypeEnum.any,
      label: '',
      value: [
        {
          value: '打招呼',
          key: 'wqre'
        },
        {
          value: '关于 xxx 的问题',
          key: 'sdfa'
        },
        {
          value: '其他问题',
          key: 'agex'
        }
      ],
      showTargetInApp: false,
      showTargetInPlugin: false
    }
  ],
  outputs: [
    Output_Template_UserChatInput,
    // custom output
    {
      key: 'wqre',
      label: '',
      type: FlowNodeOutputTypeEnum.hidden,
      targets: []
    },
    {
      key: 'sdfa',
      label: '',
      type: FlowNodeOutputTypeEnum.hidden,
      targets: []
    },
    {
      key: 'agex',
      label: '',
      type: FlowNodeOutputTypeEnum.hidden,
      targets: []
    }
  ]
};
