import { FlowNodeInputTypeEnum, FlowNodeTypeEnum } from '../../node/constant';
import { FlowModuleTemplateType } from '../../type.d';
import { userGuideTip } from '../tip';
import { ModuleIOValueTypeEnum, ModuleInputKeyEnum, ModuleTemplateTypeEnum } from '../../constants';

export const UserGuideModule: FlowModuleTemplateType = {
  id: FlowNodeTypeEnum.userGuide,
  templateType: ModuleTemplateTypeEnum.userGuide,
  flowType: FlowNodeTypeEnum.userGuide,
  avatar: '/imgs/module/userGuide.png',
  name: 'core.module.template.User guide',
  intro: userGuideTip,
  inputs: [
    {
      key: ModuleInputKeyEnum.welcomeText,
      type: FlowNodeInputTypeEnum.hidden,
      valueType: ModuleIOValueTypeEnum.string,
      label: 'core.app.Welcome Text',
      showTargetInApp: false,
      showTargetInPlugin: false
    },
    {
      key: ModuleInputKeyEnum.variables,
      type: FlowNodeInputTypeEnum.hidden,
      valueType: ModuleIOValueTypeEnum.any,
      label: 'core.module.Variable',
      value: [],
      showTargetInApp: false,
      showTargetInPlugin: false
    },
    {
      key: ModuleInputKeyEnum.questionGuide,
      valueType: ModuleIOValueTypeEnum.boolean,
      type: FlowNodeInputTypeEnum.switch,
      label: '',
      showTargetInApp: false,
      showTargetInPlugin: false
    },
    {
      key: ModuleInputKeyEnum.tts,
      type: FlowNodeInputTypeEnum.hidden,
      valueType: ModuleIOValueTypeEnum.any,
      label: '',
      showTargetInApp: false,
      showTargetInPlugin: false
    }
  ],
  outputs: []
};
