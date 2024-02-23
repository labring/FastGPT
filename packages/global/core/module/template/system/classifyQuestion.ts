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
  name: 'core.module.template.Classify question',
  intro: `core.module.template.Classify question intro`,
  showStatus: true,
  inputs: [
    Input_Template_Switch,
    {
      key: ModuleInputKeyEnum.aiModel,
      type: FlowNodeInputTypeEnum.selectCQModel,
      valueType: ModuleIOValueTypeEnum.string,
      label: 'core.module.input.label.Classify model',
      required: true,
      showTargetInApp: false,
      showTargetInPlugin: false
    },
    {
      key: ModuleInputKeyEnum.aiSystemPrompt,
      type: FlowNodeInputTypeEnum.textarea,
      valueType: ModuleIOValueTypeEnum.string,
      label: 'core.module.input.label.Background',
      description: 'core.module.input.description.Background',
      placeholder: 'core.module.input.placeholder.Classify background',
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
