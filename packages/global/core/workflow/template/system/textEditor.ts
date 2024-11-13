import {
  FlowNodeInputTypeEnum,
  FlowNodeOutputTypeEnum,
  FlowNodeTypeEnum
} from '../../node/constant';
import { FlowNodeTemplateType } from '../../type/node.d';
import {
  WorkflowIOValueTypeEnum,
  NodeOutputKeyEnum,
  FlowNodeTemplateTypeEnum,
  NodeInputKeyEnum
} from '../../constants';
import { getHandleConfig } from '../utils';
import { Input_Template_DynamicInput } from '../input';
import { i18nT } from '../../../../../web/i18n/utils';

export const TextEditorNode: FlowNodeTemplateType = {
  id: FlowNodeTypeEnum.textEditor,
  templateType: FlowNodeTemplateTypeEnum.tools,
  flowNodeType: FlowNodeTypeEnum.textEditor,
  sourceHandle: getHandleConfig(true, true, true, true),
  targetHandle: getHandleConfig(true, true, true, true),
  avatar: 'core/workflow/template/textConcat',
  name: i18nT('workflow:text_concatenation'),
  intro: i18nT('workflow:intro_text_concatenation'),
  courseUrl: '/docs/guide/workbench/workflow/text_editor/',
  version: '4813',
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
