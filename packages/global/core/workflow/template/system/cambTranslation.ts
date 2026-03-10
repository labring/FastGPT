import {
  FlowNodeInputTypeEnum,
  FlowNodeOutputTypeEnum,
  FlowNodeTypeEnum
} from '../../node/constant';
import { type FlowNodeTemplateType } from '../../type/node';
import {
  WorkflowIOValueTypeEnum,
  NodeOutputKeyEnum,
  NodeInputKeyEnum,
  FlowNodeTemplateTypeEnum
} from '../../constants';
import { i18nT } from '../../../../../web/i18n/utils';

export const CambTranslationNode: FlowNodeTemplateType = {
  id: FlowNodeTypeEnum.cambTranslation,
  templateType: FlowNodeTemplateTypeEnum.tools,
  flowNodeType: FlowNodeTypeEnum.cambTranslation,
  showSourceHandle: true,
  showTargetHandle: true,
  avatar: 'core/workflow/template/httpRequest',
  colorSchema: 'blue',
  name: i18nT('workflow:camb_translation'),
  intro: i18nT('workflow:camb_translation_intro'),
  inputs: [
    {
      key: NodeInputKeyEnum.cambSourceText,
      renderTypeList: [FlowNodeInputTypeEnum.textarea, FlowNodeInputTypeEnum.reference],
      valueType: WorkflowIOValueTypeEnum.string,
      required: true,
      label: i18nT('workflow:camb_source_text'),
      placeholder: i18nT('workflow:camb_source_text_placeholder')
    },
    {
      key: NodeInputKeyEnum.cambSourceLanguage,
      renderTypeList: [FlowNodeInputTypeEnum.input, FlowNodeInputTypeEnum.reference],
      valueType: WorkflowIOValueTypeEnum.string,
      required: true,
      label: i18nT('workflow:camb_source_language'),
      placeholder: 'e.g. 1 (English US)',
      description: i18nT('workflow:camb_language_code_desc')
    },
    {
      key: NodeInputKeyEnum.cambTargetLanguage,
      renderTypeList: [FlowNodeInputTypeEnum.input, FlowNodeInputTypeEnum.reference],
      valueType: WorkflowIOValueTypeEnum.string,
      required: true,
      label: i18nT('workflow:camb_target_language'),
      placeholder: 'e.g. 139 (Chinese Simplified)',
      description: i18nT('workflow:camb_language_code_desc')
    }
  ],
  outputs: [
    {
      id: NodeOutputKeyEnum.cambTranslatedText,
      key: NodeOutputKeyEnum.cambTranslatedText,
      label: i18nT('workflow:camb_translated_text'),
      type: FlowNodeOutputTypeEnum.static,
      valueType: WorkflowIOValueTypeEnum.string
    }
  ]
};
