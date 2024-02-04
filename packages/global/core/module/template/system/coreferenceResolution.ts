import {
  FlowNodeInputTypeEnum,
  FlowNodeOutputTypeEnum,
  FlowNodeTypeEnum
} from '../../node/constant';
import { FlowModuleTemplateType } from '../../type.d';
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

export const AiCFR: FlowModuleTemplateType = {
  id: FlowNodeTypeEnum.chatNode,
  templateType: ModuleTemplateTypeEnum.tools,
  flowType: FlowNodeTypeEnum.cfr,
  avatar: '/imgs/module/cfr.svg',
  name: 'core.module.template.cfr',
  intro: 'core.module.template.cfr intro',
  showStatus: true,
  inputs: [
    Input_Template_Switch,
    {
      key: ModuleInputKeyEnum.aiModel,
      type: FlowNodeInputTypeEnum.selectExtractModel,
      label: 'core.module.input.label.aiModel',
      required: true,
      valueType: ModuleIOValueTypeEnum.string,
      showTargetInApp: false,
      showTargetInPlugin: false
    },
    {
      key: ModuleInputKeyEnum.aiSystemPrompt,
      type: FlowNodeInputTypeEnum.textarea,
      label: 'core.module.input.label.cfr background',
      max: 300,
      valueType: ModuleIOValueTypeEnum.string,
      description: 'core.app.edit.cfr background tip',
      placeholder: 'core.module.input.placeholder.cfr background',
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
      label: 'core.module.output.label.cfr result',
      valueType: ModuleIOValueTypeEnum.string,
      type: FlowNodeOutputTypeEnum.source,
      targets: []
    }
  ]
};
