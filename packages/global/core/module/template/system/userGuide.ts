import { FlowNodeInputTypeEnum, FlowNodeTypeEnum } from '../../node/constant';
import { FlowModuleTemplateType } from '../../type.d';
import { userGuideTip } from '../tip';
import { ModuleInputKeyEnum } from '../../constants';

export const UserGuideModule: FlowModuleTemplateType = {
  id: FlowNodeTypeEnum.userGuide,
  flowType: FlowNodeTypeEnum.userGuide,
  logo: '/imgs/module/userGuide.png',
  name: '用户引导',
  intro: userGuideTip,
  inputs: [
    {
      key: ModuleInputKeyEnum.welcomeText,
      type: FlowNodeInputTypeEnum.hidden,
      label: '开场白'
    },
    {
      key: ModuleInputKeyEnum.variables,
      type: FlowNodeInputTypeEnum.hidden,
      label: '对话框变量',
      value: []
    },
    {
      key: ModuleInputKeyEnum.questionGuide,
      type: FlowNodeInputTypeEnum.switch,
      label: '问题引导'
    },
    {
      key: ModuleInputKeyEnum.tts,
      type: FlowNodeInputTypeEnum.hidden,
      label: '语音播报'
    }
  ],
  outputs: []
};
