import {
  FlowNodeInputTypeEnum,
  FlowNodeOutputTypeEnum,
  FlowNodeTypeEnum
} from '../../node/constant';
import { FlowNodeTemplateType } from '../../type';
import {
  WorkflowIOValueTypeEnum,
  NodeInputKeyEnum,
  FlowNodeTemplateTypeEnum,
  NodeOutputKeyEnum
} from '../../constants';
import {
  Input_Template_SelectAIModel,
  Input_Template_History,
  Input_Template_UserChatInput
} from '../input';
import { Input_Template_System_Prompt } from '../input';
import { LLMModelTypeEnum } from '../../../ai/constants';
import { getHandleConfig } from '../utils';

export const ClassifyQuestionModule: FlowNodeTemplateType = {
  id: FlowNodeTypeEnum.classifyQuestion,
  templateType: FlowNodeTemplateTypeEnum.functionCall,
  flowNodeType: FlowNodeTypeEnum.classifyQuestion,
  sourceHandle: getHandleConfig(false, false, false, false),
  targetHandle: getHandleConfig(true, false, true, true),
  avatar: '/imgs/workflow/cq.png',
  name: '问题分类',
  intro: `根据用户的历史记录和当前问题判断该次提问的类型。可以添加多组问题类型，下面是一个模板例子：\n类型1: 打招呼\n类型2: 关于商品“使用”问题\n类型3: 关于商品“购买”问题\n类型4: 其他问题`,
  showStatus: true,
  version: '481',
  inputs: [
    {
      ...Input_Template_SelectAIModel,
      llmModelType: LLMModelTypeEnum.classify
    },
    {
      ...Input_Template_System_Prompt,
      label: 'core.module.input.label.Background',
      description: 'core.module.input.description.Background',
      placeholder: 'core.module.input.placeholder.Classify background'
    },
    Input_Template_History,
    Input_Template_UserChatInput,
    {
      key: NodeInputKeyEnum.agents,
      renderTypeList: [FlowNodeInputTypeEnum.custom],
      valueType: WorkflowIOValueTypeEnum.any,
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
      ]
    }
  ],
  outputs: [
    {
      id: NodeOutputKeyEnum.cqResult,
      key: NodeOutputKeyEnum.cqResult,
      required: true,
      label: '分类结果',
      valueType: WorkflowIOValueTypeEnum.string,
      type: FlowNodeOutputTypeEnum.static
    }
  ]
};
