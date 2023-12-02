import { FlowNodeInputTypeEnum, FlowNodeTypeEnum, FlowNodeOutputTypeEnum } from '../../node/constant';
import { FlowModuleTemplateType } from '../../type';
import { ModuleDataTypeEnum, ModuleInputKeyEnum, ModuleTemplateTypeEnum, ModuleOutputKeyEnum } from '../../constants';
import { Input_Template_TFSwitch } from '../input';
import { Output_Template_Finish } from '../output';

export const RunCodeModule: FlowModuleTemplateType = {
  id: FlowNodeTypeEnum.runCode,
  templateType: ModuleTemplateTypeEnum.functionCall,
  flowType: FlowNodeTypeEnum.runCode,
  avatar: '/imgs/module/http.png',
  name: '执行代码',
  intro: '可以执行代码',
  showStatus: true,
  inputs: [
    Input_Template_TFSwitch,
    {
      key: ModuleInputKeyEnum.inputData,
      type: FlowNodeInputTypeEnum.target,
      valueType: ModuleDataTypeEnum.any,
      label: '输入数据',
      showTargetInApp: false,
      showTargetInPlugin: false
    },
    {
      key: ModuleInputKeyEnum.code,
      value: '',
      type: FlowNodeInputTypeEnum.textarea,
      valueType: ModuleDataTypeEnum.string,
      label: '代码',
      description: '输入的数据是inputData变量，输出必须赋值给result变量',
      placeholder: 'result = "hello"',
      required: true,
      showTargetInApp: false,
      showTargetInPlugin: false
    }
  ],
  outputs: [
    {
      key: ModuleOutputKeyEnum.answerText,
      label: '运行结果',
      description: '程序运行的结果，代码中必须有result的变量',
      valueType: ModuleDataTypeEnum.string,
      type: FlowNodeOutputTypeEnum.source,
      targets: []
    },
    {
      key: ModuleOutputKeyEnum.success,
      label: '运行成功',
      valueType: ModuleDataTypeEnum.boolean,
      type: FlowNodeOutputTypeEnum.source,
      targets: []
    },
    {
      key: ModuleOutputKeyEnum.failed,
      label: '运行失败',
      valueType: ModuleDataTypeEnum.boolean,
      type: FlowNodeOutputTypeEnum.source,
      targets: []
    },
    Output_Template_Finish
  ]
};
