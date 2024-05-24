import {
  FlowNodeInputTypeEnum,
  FlowNodeOutputTypeEnum,
  FlowNodeTypeEnum
} from '../../node/constant';
import { FlowNodeTemplateType } from '../../type/index.d';
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

export const AiQueryExtension: FlowNodeTemplateType = {
  id: FlowNodeTypeEnum.chatNode,
  templateType: FlowNodeTemplateTypeEnum.other,
  flowNodeType: FlowNodeTypeEnum.queryExtension,
  sourceHandle: getHandleConfig(true, true, true, true),
  targetHandle: getHandleConfig(true, true, true, true),
  avatar: '/imgs/workflow/cfr.svg',
  name: '问题优化',
  intro:
    '使用问题优化功能，可以提高知识库连续对话时搜索的精度。使用该功能后，会先利用 AI 根据上下文构建一个或多个新的检索词，这些检索词更利于进行知识库搜索。该模块已内置在知识库搜索模块中，如果您仅进行一次知识库搜索，可直接使用知识库内置的补全功能。',
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
      label: 'core.app.edit.Query extension background prompt',
      max: 300,
      valueType: WorkflowIOValueTypeEnum.string,
      description: 'core.app.edit.Query extension background tip',
      placeholder: 'core.module.QueryExtension.placeholder'
    },
    Input_Template_History,
    Input_Template_UserChatInput
  ],
  outputs: [
    {
      id: NodeOutputKeyEnum.text,
      key: NodeOutputKeyEnum.text,
      label: 'core.module.output.label.query extension result',
      description: 'core.module.output.description.query extension result',
      valueType: WorkflowIOValueTypeEnum.string,
      type: FlowNodeOutputTypeEnum.static
    }
  ]
};
