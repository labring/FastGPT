import { i18nT } from '../../../../../../web/i18n/utils';
import {
  FlowNodeTemplateTypeEnum,
  NodeInputKeyEnum,
  NodeOutputKeyEnum,
  WorkflowIOValueTypeEnum
} from '../../../constants';
import {
  FlowNodeInputTypeEnum,
  FlowNodeOutputTypeEnum,
  FlowNodeTypeEnum
} from '../../../node/constant';
import { type FlowNodeTemplateType } from '../../../type/node';

export const FormInputNode: FlowNodeTemplateType = {
  id: FlowNodeTypeEnum.formInput,
  templateType: FlowNodeTemplateTypeEnum.interactive,
  flowNodeType: FlowNodeTypeEnum.formInput,
  showSourceHandle: true,
  showTargetHandle: true,
  avatar: 'core/workflow/systemNode/formInput',
  avatarLinear: 'core/workflow/systemNode/formInputLinear',
  colorSchema: 'violetDeep',
  name: i18nT('app:workflow.form_input'),
  intro: i18nT(`app:workflow.form_input_tip`),
  isTool: true,
  inputs: [
    {
      key: NodeInputKeyEnum.description,
      renderTypeList: [FlowNodeInputTypeEnum.textarea],
      valueType: WorkflowIOValueTypeEnum.string,
      label: i18nT('app:workflow.select_description'),
      description: i18nT('app:workflow.input_description_tip'),
      placeholder: i18nT('app:workflow.form_input_description_placeholder')
    },
    {
      key: NodeInputKeyEnum.userInputForms,
      renderTypeList: [FlowNodeInputTypeEnum.custom],
      valueType: WorkflowIOValueTypeEnum.any,
      label: '',
      value: []
    }
  ],
  outputs: [
    {
      id: NodeOutputKeyEnum.formInputResult,
      key: NodeOutputKeyEnum.formInputResult,
      required: true,
      label: i18nT('workflow:form_input_result'),
      description: i18nT('workflow:form_input_result_tip'),
      valueType: WorkflowIOValueTypeEnum.object,
      type: FlowNodeOutputTypeEnum.static
    }
  ]
};
