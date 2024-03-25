import { FlowNodeInputTypeEnum, FlowNodeTypeEnum } from '../../node/constant';
import { FlowNodeTemplateType } from '../../type.d';
import {
  ModuleIOValueTypeEnum,
  ModuleInputKeyEnum,
  FlowNodeTemplateTypeEnum
} from '../../constants';
import { Input_Template_Switch } from '../input';
import { Output_Template_Finish } from '../output';

export const AssignedAnswerModule: FlowNodeTemplateType = {
  id: FlowNodeTypeEnum.answerNode,
  templateType: FlowNodeTemplateTypeEnum.textAnswer,
  flowType: FlowNodeTypeEnum.answerNode,
  avatar: '/imgs/module/reply.png',
  name: '指定回复',
  intro:
    '该模块可以直接回复一段指定的内容。常用于引导、提示。非字符串内容传入时，会转成字符串进行输出。',
  inputs: [
    Input_Template_Switch,
    {
      key: ModuleInputKeyEnum.answerText,
      type: FlowNodeInputTypeEnum.textarea,
      valueType: ModuleIOValueTypeEnum.any,
      label: 'core.module.input.label.Response content',
      description: 'core.module.input.description.Response content',
      placeholder: 'core.module.input.description.Response content',
      showTargetInApp: true,
      showTargetInPlugin: true
    }
  ],
  outputs: [Output_Template_Finish]
};
