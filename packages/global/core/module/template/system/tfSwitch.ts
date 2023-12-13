import {
  FlowNodeInputTypeEnum,
  FlowNodeOutputTypeEnum,
  FlowNodeTypeEnum
} from '../../node/constant';
import { FlowModuleTemplateType } from '../../type';
import {
  ModuleDataTypeEnum,
  ModuleInputKeyEnum,
  ModuleOutputKeyEnum,
  ModuleTemplateTypeEnum
} from '../../constants';
import { Input_Template_TFSwitch } from '../input';

export const TFSwitchModule: FlowModuleTemplateType = {
  id: FlowNodeTypeEnum.tfSwitch,
  flowType: FlowNodeTypeEnum.tfSwitch,
  templateType: ModuleTemplateTypeEnum.tools,
  avatar: '/imgs/module/tfSwitch.svg',
  name: 'core.module.template.TFSwitch',
  intro: 'core.module.template.TFSwitch intro',
  showStatus: false,
  inputs: [
    Input_Template_TFSwitch,
    {
      key: ModuleInputKeyEnum.anyInput,
      type: FlowNodeInputTypeEnum.target,
      valueType: ModuleDataTypeEnum.any,
      label: 'core.module.input.label.anyInput',
      description: 'core.module.input.description.anyInput',
      required: false,
      showTargetInApp: true,
      showTargetInPlugin: true
    },
    {
      key: ModuleInputKeyEnum.textareaInput,
      type: FlowNodeInputTypeEnum.textarea,
      valueType: ModuleDataTypeEnum.string,
      label: 'core.module.input.label.TFSwitch textarea',
      description: 'core.module.input.description.TFSwitch textarea',
      placeholder: 'core.module.input.description.TFSwitch textarea',
      required: false,
      showTargetInApp: false,
      showTargetInPlugin: false
    }
  ],
  outputs: [
    {
      key: ModuleOutputKeyEnum.resultTrue,
      label: 'core.module.output.label.result true',
      valueType: ModuleDataTypeEnum.boolean,
      type: FlowNodeOutputTypeEnum.source,
      targets: []
    },
    {
      key: ModuleOutputKeyEnum.resultFalse,
      label: 'core.module.output.label.result false',
      valueType: ModuleDataTypeEnum.boolean,
      type: FlowNodeOutputTypeEnum.source,
      targets: []
    }
  ]
};
