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
import {
  Input_Template_History,
  Input_Template_Switch,
  Input_Template_UserChatInput
} from '../input';
import { Output_Template_UserChatInput } from '../output';

export const AiQueryExtension: FlowModuleTemplateType = {
  id: FlowNodeTypeEnum.chatNode,
  templateType: ModuleTemplateTypeEnum.other,
  flowType: FlowNodeTypeEnum.queryExtension,
  avatar: '/imgs/module/cfr.svg',
  name: 'core.module.template.Query extension',
  intro: 'core.module.template.Query extension intro',
  showStatus: true,
  inputs: [
    Input_Template_Switch,
    {
      key: ModuleInputKeyEnum.aiModel,
      type: FlowNodeInputTypeEnum.selectLLMModel,
      label: 'core.module.input.label.aiModel',
      required: true,
      valueType: ModuleIOValueTypeEnum.string,
      showTargetInApp: false,
      showTargetInPlugin: false
    },
    {
      key: ModuleInputKeyEnum.aiSystemPrompt,
      type: FlowNodeInputTypeEnum.textarea,
      label: 'core.app.edit.Query extension background prompt',
      max: 300,
      valueType: ModuleIOValueTypeEnum.string,
      description: 'core.app.edit.Query extension background tip',
      placeholder: 'core.module.QueryExtension.placeholder',
      showTargetInApp: true,
      showTargetInPlugin: true
    },
    Input_Template_History,
    Input_Template_UserChatInput
  ],
  outputs: [
    Output_Template_UserChatInput,
    {
      key: ModuleOutputKeyEnum.text,
      label: 'core.module.output.label.query extension result',
      description: 'core.module.output.description.query extension result',
      valueType: ModuleIOValueTypeEnum.string,
      type: FlowNodeOutputTypeEnum.source,
      targets: []
    }
  ]
};
