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

export const CambVoiceCloneNode: FlowNodeTemplateType = {
  id: FlowNodeTypeEnum.cambVoiceClone,
  templateType: FlowNodeTemplateTypeEnum.tools,
  flowNodeType: FlowNodeTypeEnum.cambVoiceClone,
  showSourceHandle: true,
  showTargetHandle: true,
  avatar: 'core/workflow/template/httpRequest',
  colorSchema: 'purple',
  name: i18nT('workflow:camb_voice_clone'),
  intro: i18nT('workflow:camb_voice_clone_intro'),
  inputs: [
    {
      key: NodeInputKeyEnum.cambVoiceName,
      renderTypeList: [FlowNodeInputTypeEnum.input, FlowNodeInputTypeEnum.reference],
      valueType: WorkflowIOValueTypeEnum.string,
      required: true,
      label: i18nT('workflow:camb_voice_name'),
      placeholder: i18nT('workflow:camb_voice_name_placeholder')
    },
    {
      key: NodeInputKeyEnum.cambAudioUrl,
      renderTypeList: [FlowNodeInputTypeEnum.input, FlowNodeInputTypeEnum.reference],
      valueType: WorkflowIOValueTypeEnum.string,
      required: true,
      label: i18nT('workflow:camb_audio_url'),
      placeholder: 'https://example.com/audio.wav'
    },
    {
      key: NodeInputKeyEnum.cambGender,
      renderTypeList: [FlowNodeInputTypeEnum.select],
      valueType: WorkflowIOValueTypeEnum.string,
      label: i18nT('workflow:camb_gender'),
      list: [
        { label: 'Male', value: 'male' },
        { label: 'Female', value: 'female' }
      ]
    }
  ],
  outputs: [
    {
      id: NodeOutputKeyEnum.cambVoiceId,
      key: NodeOutputKeyEnum.cambVoiceId,
      label: i18nT('workflow:camb_voice_id'),
      type: FlowNodeOutputTypeEnum.static,
      valueType: WorkflowIOValueTypeEnum.string
    }
  ]
};
