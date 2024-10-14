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
import { FlowNodeTemplateType } from '../../../type/node';
import { getHandleConfig } from '../../utils';

export const FormInputNode: FlowNodeTemplateType = {
  id: FlowNodeTypeEnum.formInput,
  templateType: FlowNodeTemplateTypeEnum.interactive,
  flowNodeType: FlowNodeTypeEnum.formInput,
  sourceHandle: getHandleConfig(true, true, true, true),
  targetHandle: getHandleConfig(true, true, true, true),
  avatar: 'core/workflow/template/formInput',
  name: i18nT('app:workflow.form_input'),
  intro: i18nT(`app:workflow.form_input_tip`),
  isTool: true,
  version: '4811',
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
