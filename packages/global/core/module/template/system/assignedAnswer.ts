import { FlowNodeInputTypeEnum, FlowNodeTypeEnum } from '../../node/constant';
import { FlowModuleTemplateType } from '../../type.d';
import { ModuleIOValueTypeEnum, ModuleInputKeyEnum, ModuleTemplateTypeEnum } from '../../constants';
import { Input_Template_Switch } from '../input';
import { Output_Template_Finish } from '../output';

export const AssignedAnswerModule: FlowModuleTemplateType = {
  id: FlowNodeTypeEnum.answerNode,
  templateType: ModuleTemplateTypeEnum.textAnswer,
  flowType: FlowNodeTypeEnum.answerNode,
  avatar: '/imgs/module/reply.png',
  name: 'core.module.template.Assigned reply',
  intro: 'core.module.template.Assigned reply intro',
  inputs: [
    Input_Template_Switch,
    {
      key: ModuleInputKeyEnum.answerText,
      type: FlowNodeInputTypeEnum.textarea,
      valueType: ModuleIOValueTypeEnum.any,
      label: 'core.module.input.label.Response content',
      description: 'core.module.input.description.Response content',
      placeholder: 'core.module.input.description.Response content',
      showTargetInApp: true,
      showTargetInPlugin: true
    }
  ],
  outputs: [Output_Template_Finish]
};
