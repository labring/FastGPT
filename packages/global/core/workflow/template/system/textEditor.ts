import {
  FlowNodeInputTypeEnum,
  FlowNodeOutputTypeEnum,
  FlowNodeTypeEnum
} from '../../node/constant';
import { type FlowNodeTemplateType } from '../../type/node.d';
import {
  WorkflowIOValueTypeEnum,
  NodeOutputKeyEnum,
  NodeInputKeyEnum,
  FlowNodeTemplateTypeEnum
} from '../../constants';
import { i18nT } from '../../../../../web/i18n/utils';

export const TextEditorNode: FlowNodeTemplateType = {
  id: FlowNodeTypeEnum.textEditor,
  templateType: FlowNodeTemplateTypeEnum.tools,
  flowNodeType: FlowNodeTypeEnum.textEditor,
  showSourceHandle: true,
  showTargetHandle: true,
  avatar: 'core/workflow/systemNode/textConcat',
  avatarLinear: 'core/workflow/systemNode/textConcatLinear',
  colorSchema: 'orange',
  name: i18nT('workflow:text_concatenation'),
  intro: i18nT('workflow:intro_text_concatenation'),
  courseUrl: '/docs/introduction/guide/dashboard/workflow/text_editor/',
  inputs: [
    {
      key: NodeInputKeyEnum.textareaInput,
      renderTypeList: [FlowNodeInputTypeEnum.textarea],
      valueType: WorkflowIOValueTypeEnum.string,
      required: true,
      label: i18nT('workflow:concatenation_text'),
      placeholder: i18nT('workflow:input_variable_list')
    }
  ],
  outputs: [
    {
      id: NodeOutputKeyEnum.text,
      key: NodeOutputKeyEnum.text,
      label: i18nT('workflow:concatenation_result'),
      type: FlowNodeOutputTypeEnum.static,
      valueType: WorkflowIOValueTypeEnum.string
    }
  ]
};
