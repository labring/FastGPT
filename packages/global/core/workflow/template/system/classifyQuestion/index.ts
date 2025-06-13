import {
  FlowNodeInputTypeEnum,
  FlowNodeOutputTypeEnum,
  FlowNodeTypeEnum
} from '../../../node/constant';
import { type FlowNodeTemplateType } from '../../../type/node';
import {
  WorkflowIOValueTypeEnum,
  NodeInputKeyEnum,
  FlowNodeTemplateTypeEnum,
  NodeOutputKeyEnum
} from '../../../constants';
import {
  Input_Template_SelectAIModel,
  Input_Template_History,
  Input_Template_UserChatInput
} from '../../input';
import { Input_Template_System_Prompt } from '../../input';
import { LLMModelTypeEnum } from '../../../../ai/constants';
import { getHandleConfig } from '../../utils';
import { i18nT } from '../../../../../../web/i18n/utils';

export const ClassifyQuestionModule: FlowNodeTemplateType = {
  id: FlowNodeTypeEnum.classifyQuestion,
  templateType: FlowNodeTemplateTypeEnum.ai,
  flowNodeType: FlowNodeTypeEnum.classifyQuestion,
  sourceHandle: getHandleConfig(false, false, false, false),
  targetHandle: getHandleConfig(true, false, true, true),
  avatar: 'core/workflow/template/questionClassify',
  name: i18nT('workflow:question_classification'),
  intro: i18nT('workflow:intro_question_classification'),
  showStatus: true,
  version: '4.9.2',
  courseUrl: '/docs/guide/dashboard/workflow/question_classify/',
  inputs: [
    {
      ...Input_Template_SelectAIModel,
      llmModelType: LLMModelTypeEnum.classify
    },
    {
      ...Input_Template_System_Prompt,
      label: i18nT('common:core.module.input.label.Background'),
      description: i18nT('common:core.module.input.description.Background'),
      placeholder: i18nT('common:core.module.input.placeholder.Classify background')
    },
    Input_Template_History,
    Input_Template_UserChatInput,
    {
      key: NodeInputKeyEnum.agents,
      renderTypeList: [FlowNodeInputTypeEnum.custom],
      valueType: WorkflowIOValueTypeEnum.any,
      label: '',
      value: [
        {
          value: 'Greeting',
          key: 'wqre'
        },
        {
          value: 'Question regarding xxx',
          key: 'sdfa'
        },
        {
          value: 'Other Questions',
          key: 'agex'
        }
      ]
    }
  ],
  outputs: [
    {
      id: NodeOutputKeyEnum.cqResult,
      key: NodeOutputKeyEnum.cqResult,
      required: true,
      label: i18nT('workflow:classification_result'),
      valueType: WorkflowIOValueTypeEnum.string,
      type: FlowNodeOutputTypeEnum.static
    }
  ]
};
