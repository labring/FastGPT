import {
  FlowNodeInputTypeEnum,
  FlowNodeOutputTypeEnum,
  FlowNodeTypeEnum
} from '../../node/constant';
import { FlowModuleTemplateType } from '../../type';
import {
  ModuleIOValueTypeEnum,
  ModuleInputKeyEnum,
  ModuleOutputKeyEnum,
  ModuleTemplateTypeEnum
} from '../../constants';
import { Input_Template_AddInputParam, Input_Template_Switch } from '../input';

export const TextEditorModule: FlowModuleTemplateType = {
  id: FlowNodeTypeEnum.textEditor,
  templateType: ModuleTemplateTypeEnum.tools,
  flowType: FlowNodeTypeEnum.textEditor,
  avatar: '/imgs/module/textEditor.svg',
  name: 'core.module.template.textEditor',
  intro: 'core.module.template.textEditor intro',
  showStatus: false,
  inputs: [
    Input_Template_Switch,
    {
      key: ModuleInputKeyEnum.textareaInput,
      type: FlowNodeInputTypeEnum.custom,
      valueType: ModuleIOValueTypeEnum.string,
      label: 'core.module.input.label.textEditor textarea',
      description: 'core.module.input.description.textEditor textarea',
      placeholder: 'core.module.input.description.textEditor textarea',
      required: false,
      showTargetInApp: true,
      showTargetInPlugin: true
    },
    {
      ...Input_Template_AddInputParam,
      editField: {
        key: true,
        name: true,
        description: true
      },
      defaultEditField: {
        label: '',
        key: '',
        description: '',
        inputType: FlowNodeInputTypeEnum.target,
        valueType: ModuleIOValueTypeEnum.string,
        required: true
      }
    }
  ],
  outputs: [
    {
      key: ModuleOutputKeyEnum.text,
      label: 'core.module.output.label.text',
      valueType: ModuleIOValueTypeEnum.string,
      type: FlowNodeOutputTypeEnum.source,
      targets: []
    }
  ]
};
