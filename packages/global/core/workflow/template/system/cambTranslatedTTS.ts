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

export const CambTranslatedTTSNode: FlowNodeTemplateType = {
  id: FlowNodeTypeEnum.cambTranslatedTTS,
  templateType: FlowNodeTemplateTypeEnum.tools,
  flowNodeType: FlowNodeTypeEnum.cambTranslatedTTS,
  showSourceHandle: true,
  showTargetHandle: true,
  avatar: 'core/workflow/template/httpRequest',
  colorSchema: 'teal',
  name: i18nT('workflow:camb_translated_tts'),
  intro: i18nT('workflow:camb_translated_tts_intro'),
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
    },
    {
      key: NodeInputKeyEnum.cambVoiceId,
      renderTypeList: [FlowNodeInputTypeEnum.input, FlowNodeInputTypeEnum.reference],
      valueType: WorkflowIOValueTypeEnum.string,
      required: true,
      label: i18nT('workflow:camb_voice_id'),
      placeholder: i18nT('workflow:camb_voice_id_placeholder')
    },
    {
      key: NodeInputKeyEnum.cambSpeed,
      renderTypeList: [FlowNodeInputTypeEnum.numberInput],
      valueType: WorkflowIOValueTypeEnum.number,
      label: i18nT('workflow:camb_speed'),
      defaultValue: 1.0,
      min: 0.5,
      max: 2.0,
      step: 0.1
    }
  ],
  outputs: [
    {
      id: NodeOutputKeyEnum.cambAudioUrl,
      key: NodeOutputKeyEnum.cambAudioUrl,
      label: i18nT('workflow:camb_audio_url_output'),
      type: FlowNodeOutputTypeEnum.static,
      valueType: WorkflowIOValueTypeEnum.string
    },
    {
      id: NodeOutputKeyEnum.cambTranslatedText,
      key: NodeOutputKeyEnum.cambTranslatedText,
      label: i18nT('workflow:camb_translated_text'),
      type: FlowNodeOutputTypeEnum.static,
      valueType: WorkflowIOValueTypeEnum.string
    }
  ]
};
