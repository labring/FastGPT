import { FlowNodeInputTypeEnum, FlowNodeTypeEnum } from '../../node/constant';
import { FlowModuleTemplateType } from '../../type.d';
import { userGuideTip } from '../tip';
import { ModuleDataTypeEnum, ModuleInputKeyEnum, ModuleTemplateTypeEnum } from '../../constants';

export const UserGuideModule: FlowModuleTemplateType = {
  id: FlowNodeTypeEnum.userGuide,
  templateType: ModuleTemplateTypeEnum.userGuide,
  flowType: FlowNodeTypeEnum.userGuide,
  avatar: '/imgs/module/userGuide.png',
  name: '用户引导',
  intro: userGuideTip,
  inputs: [
    {
      key: ModuleInputKeyEnum.welcomeText,
      type: FlowNodeInputTypeEnum.hidden,
      valueType: ModuleDataTypeEnum.string,
      label: '开场白',
      showTargetInApp: false,
      showTargetInPlugin: false
    },
    {
      key: ModuleInputKeyEnum.variables,
      type: FlowNodeInputTypeEnum.hidden,
      valueType: ModuleDataTypeEnum.any,
      label: '对话框变量',
      value: [],
      showTargetInApp: false,
      showTargetInPlugin: false
    },
    {
      key: ModuleInputKeyEnum.questionGuide,
      valueType: ModuleDataTypeEnum.boolean,
      type: FlowNodeInputTypeEnum.switch,
      label: '问题引导',
      showTargetInApp: false,
      showTargetInPlugin: false
    },
    {
      key: ModuleInputKeyEnum.tts,
      type: FlowNodeInputTypeEnum.hidden,
      valueType: ModuleDataTypeEnum.any,
      label: '语音播报',
      showTargetInApp: false,
      showTargetInPlugin: false
    }
  ],
  outputs: []
};
