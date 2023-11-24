import { FlowNodeInputTypeEnum, FlowNodeTypeEnum } from '../../node/constant';
import { FlowModuleTemplateType } from '../../type.d';
import { ModuleDataTypeEnum, ModuleInputKeyEnum, ModuleTemplateTypeEnum } from '../../constants';
import { Input_Template_TFSwitch } from '../input';
import { Output_Template_Finish } from '../output';

export const AssignedAnswerModule: FlowModuleTemplateType = {
  id: FlowNodeTypeEnum.answerNode,
  templateType: ModuleTemplateTypeEnum.textAnswer,
  flowType: FlowNodeTypeEnum.answerNode,
  avatar: '/imgs/module/reply.png',
  name: '指定回复',
  intro: '该模块可以直接回复一段指定的内容。常用于引导、提示',
  inputs: [
    Input_Template_TFSwitch,
    {
      key: ModuleInputKeyEnum.answerText,
      type: FlowNodeInputTypeEnum.textarea,
      valueType: ModuleDataTypeEnum.any,
      value: '',
      label: '回复的内容',
      description:
        '可以使用 \\n 来实现连续换行。\n\n可以通过外部模块输入实现回复，外部模块输入时会覆盖当前填写的内容。\n\n如传入非字符串类型数据将会自动转成字符串',
      showTargetInApp: true,
      showTargetInPlugin: true
    }
  ],
  outputs: [Output_Template_Finish]
};
