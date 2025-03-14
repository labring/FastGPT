import {
  FlowNodeInputTypeEnum,
  FlowNodeOutputTypeEnum,
  FlowNodeTypeEnum
} from '../../../node/constant';
import { FlowNodeTemplateType } from '../../../type/node';
import {
  WorkflowIOValueTypeEnum,
  NodeInputKeyEnum,
  NodeOutputKeyEnum,
  FlowNodeTemplateTypeEnum
} from '../../../constants';
import { Input_Template_SelectAIModel, Input_Template_History } from '../../input';
import { LLMModelTypeEnum } from '../../../../ai/constants';
import { getHandleConfig } from '../../utils';
import { i18nT } from '../../../../../../web/i18n/utils';

export const ContextExtractModule: FlowNodeTemplateType = {
  id: FlowNodeTypeEnum.contentExtract,
  templateType: FlowNodeTemplateTypeEnum.ai,
  flowNodeType: FlowNodeTypeEnum.contentExtract,
  sourceHandle: getHandleConfig(true, true, true, true),
  targetHandle: getHandleConfig(true, true, true, true),
  avatar: 'core/workflow/template/extractJson',
  name: i18nT('workflow:text_content_extraction'),
  intro: i18nT('workflow:intro_text_content_extraction'),
  showStatus: true,
  isTool: true,
  courseUrl: '/docs/guide/workbench/workflow/content_extract/',
  version: '481',
  inputs: [
    {
      ...Input_Template_SelectAIModel,
      llmModelType: LLMModelTypeEnum.extractFields
    },
    {
      key: NodeInputKeyEnum.description,
      renderTypeList: [FlowNodeInputTypeEnum.textarea, FlowNodeInputTypeEnum.reference],
      valueType: WorkflowIOValueTypeEnum.string,
      label: i18nT('workflow:extraction_requirements_description'),
      description: i18nT('workflow:extraction_requirements_description_detail'),
      placeholder: i18nT('workflow:extraction_requirements_placeholder')
    },
    Input_Template_History,
    {
      key: NodeInputKeyEnum.contextExtractInput,
      renderTypeList: [FlowNodeInputTypeEnum.reference, FlowNodeInputTypeEnum.textarea],
      label: i18nT('workflow:text_to_extract'),
      required: true,
      valueType: WorkflowIOValueTypeEnum.string,
      toolDescription: i18nT('workflow:content_to_retrieve')
    },
    {
      key: NodeInputKeyEnum.extractKeys,
      renderTypeList: [FlowNodeInputTypeEnum.custom],
      label: '',
      valueType: WorkflowIOValueTypeEnum.any,
      description: i18nT('workflow:target_fields_description'),
      value: [] // {valueType: string; desc: string; key: string; required: boolean; enum: string[]}[]
    }
  ],
  outputs: [
    {
      id: NodeOutputKeyEnum.success,
      key: NodeOutputKeyEnum.success,
      label: i18nT('workflow:full_field_extraction'),
      required: true,
      description: i18nT('workflow:full_field_extraction_description'),
      valueType: WorkflowIOValueTypeEnum.boolean,
      type: FlowNodeOutputTypeEnum.static
    },
    {
      id: NodeOutputKeyEnum.contextExtractFields,
      key: NodeOutputKeyEnum.contextExtractFields,
      label: i18nT('workflow:complete_extraction_result'),
      required: true,
      description: i18nT('workflow:complete_extraction_result_description'),
      valueType: WorkflowIOValueTypeEnum.string,
      type: FlowNodeOutputTypeEnum.static
    }
  ]
};
