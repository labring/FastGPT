import {
  FlowNodeInputTypeEnum,
  FlowNodeOutputTypeEnum,
  FlowNodeTypeEnum
} from '../../node/constant';
import { FlowNodeTemplateType } from '../../type/node.d';
import {
  WorkflowIOValueTypeEnum,
  NodeInputKeyEnum,
  NodeOutputKeyEnum,
  FlowNodeTemplateTypeEnum
} from '../../constants';
import {
  Input_Template_History,
  Input_Template_UserChatInput,
  Input_Template_SelectAIModel
} from '../input';
import { LLMModelTypeEnum } from '../../../ai/constants';
import { getHandleConfig } from '../utils';
import { i18nT } from '../../../../../web/i18n/utils';

export const AiQueryExtension: FlowNodeTemplateType = {
  id: FlowNodeTypeEnum.queryExtension,
  templateType: FlowNodeTemplateTypeEnum.other,
  flowNodeType: FlowNodeTypeEnum.queryExtension,
  sourceHandle: getHandleConfig(true, true, true, true),
  targetHandle: getHandleConfig(true, true, true, true),
  avatar: 'core/workflow/template/queryExtension',
  name: i18nT('workflow:question_optimization'),
  intro: i18nT('workflow:intro_question_optimization'),
  showStatus: true,
  version: '481',
  inputs: [
    {
      ...Input_Template_SelectAIModel,
      llmModelType: LLMModelTypeEnum.queryExtension
    },
    {
      key: NodeInputKeyEnum.aiSystemPrompt,
      renderTypeList: [FlowNodeInputTypeEnum.textarea, FlowNodeInputTypeEnum.reference],
      label: i18nT('common:core.app.edit.Query extension background prompt'),
      max: 300,
      valueType: WorkflowIOValueTypeEnum.string,
      description: i18nT('common:core.app.edit.Query extension background tip'),
      placeholder: i18nT('common:core.module.QueryExtension.placeholder')
    },
    Input_Template_History,
    Input_Template_UserChatInput
  ],
  outputs: [
    {
      id: NodeOutputKeyEnum.text,
      key: NodeOutputKeyEnum.text,
      label: i18nT('common:core.module.output.label.query extension result'),
      description: i18nT('common:core.module.output.description.query extension result'),
      valueType: WorkflowIOValueTypeEnum.string,
      type: FlowNodeOutputTypeEnum.static
    }
  ]
};
