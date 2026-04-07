import {
  datasetSelectValueDesc,
  FlowNodeInputTypeEnum,
  FlowNodeOutputTypeEnum,
  FlowNodeTypeEnum
} from '../../../node/constant';
import { type FlowNodeTemplateType } from '../../../type/node';
import {
  WorkflowIOValueTypeEnum,
  NodeOutputKeyEnum,
  FlowNodeTemplateTypeEnum,
  NodeInputKeyEnum
} from '../../../constants';
import {
  Input_Template_SettingAiModel,
  Input_Template_System_Prompt,
  Input_Template_UserChatInput
} from '../../input';
import { chatNodeSystemPromptTip, systemPromptTip } from '../../tip';
import { i18nT } from '../../../../../../web/i18n/utils';
import { Input_Template_File_Link } from '../../input';
import { Output_Template_Error_Message } from '../../output';
import { DatasetSearchModeEnum } from '../../../../dataset/constants';

export const AgentNode: FlowNodeTemplateType = {
  id: FlowNodeTypeEnum.agent,
  flowNodeType: FlowNodeTypeEnum.agent,
  templateType: FlowNodeTemplateTypeEnum.ai,
  showSourceHandle: true,
  showTargetHandle: true,
  avatar: 'core/workflow/template/agent',
  avatarLinear: 'core/workflow/template/agentLinear',
  colorSchema: 'emerald',
  name: i18nT('workflow:template.agent_module'),
  intro: i18nT('workflow:template.agent_module_intro'),
  showStatus: true,
  catchError: false,
  version: '4.17.0',
  inputs: [
    Input_Template_SettingAiModel,
    {
      key: NodeInputKeyEnum.aiChatTemperature,
      renderTypeList: [FlowNodeInputTypeEnum.hidden],
      label: '',
      valueType: WorkflowIOValueTypeEnum.number
    },
    {
      key: NodeInputKeyEnum.aiChatMaxToken,
      renderTypeList: [FlowNodeInputTypeEnum.hidden],
      label: '',
      valueType: WorkflowIOValueTypeEnum.number
    },
    {
      key: NodeInputKeyEnum.aiChatIsResponseText,
      renderTypeList: [FlowNodeInputTypeEnum.hidden],
      label: '',
      value: true,
      valueType: WorkflowIOValueTypeEnum.boolean
    },
    {
      key: NodeInputKeyEnum.aiChatVision,
      renderTypeList: [FlowNodeInputTypeEnum.hidden],
      label: '',
      valueType: WorkflowIOValueTypeEnum.boolean,
      value: true
    },
    {
      key: NodeInputKeyEnum.aiChatReasoning,
      renderTypeList: [FlowNodeInputTypeEnum.hidden],
      label: '',
      valueType: WorkflowIOValueTypeEnum.boolean,
      value: true
    },
    {
      key: NodeInputKeyEnum.aiChatTopP,
      renderTypeList: [FlowNodeInputTypeEnum.hidden],
      label: '',
      valueType: WorkflowIOValueTypeEnum.number
    },
    {
      key: NodeInputKeyEnum.aiChatStopSign,
      renderTypeList: [FlowNodeInputTypeEnum.hidden],
      label: '',
      valueType: WorkflowIOValueTypeEnum.string
    },
    {
      key: NodeInputKeyEnum.aiChatResponseFormat,
      renderTypeList: [FlowNodeInputTypeEnum.hidden],
      label: '',
      valueType: WorkflowIOValueTypeEnum.string
    },
    {
      key: NodeInputKeyEnum.aiChatJsonSchema,
      renderTypeList: [FlowNodeInputTypeEnum.hidden],
      label: '',
      valueType: WorkflowIOValueTypeEnum.string
    },

    {
      ...Input_Template_System_Prompt,
      label: i18nT('common:core.ai.Prompt'),
      description: systemPromptTip,
      placeholder: chatNodeSystemPromptTip
    },
    Input_Template_File_Link,
    Input_Template_UserChatInput,
    // Skill
    {
      key: NodeInputKeyEnum.skills,
      renderTypeList: [FlowNodeInputTypeEnum.selectSkill, FlowNodeInputTypeEnum.reference],
      label: 'Skill',
      valueType: WorkflowIOValueTypeEnum.arrayObject,
      valueDesc: '{\n skillId:string;\n}[]',
      value: []
    },
    // Tool
    {
      key: NodeInputKeyEnum.selectedTools,
      renderTypeList: [FlowNodeInputTypeEnum.selectTool, FlowNodeInputTypeEnum.reference],
      label: i18nT('workflow:agent.tools'),
      valueType: WorkflowIOValueTypeEnum.arrayObject,
      valueDesc: '{\n toolId:string;\n}[]',
      value: []
    },
    // Dataset
    {
      key: NodeInputKeyEnum.datasetSelectList,
      renderTypeList: [FlowNodeInputTypeEnum.selectDataset, FlowNodeInputTypeEnum.reference],
      label: i18nT('common:core.module.input.label.Select dataset'),
      value: [],
      valueType: WorkflowIOValueTypeEnum.selectDataset,
      valueDesc: datasetSelectValueDesc
    },
    {
      key: NodeInputKeyEnum.datasetSimilarity,
      renderTypeList: [FlowNodeInputTypeEnum.selectDatasetParamsModal],
      label: '',
      value: 0.4,
      valueType: WorkflowIOValueTypeEnum.number
    },
    {
      key: NodeInputKeyEnum.datasetMaxTokens,
      renderTypeList: [FlowNodeInputTypeEnum.hidden],
      label: '',
      value: 5000,
      valueType: WorkflowIOValueTypeEnum.number
    },
    {
      key: NodeInputKeyEnum.datasetSearchMode,
      renderTypeList: [FlowNodeInputTypeEnum.hidden],
      label: '',
      valueType: WorkflowIOValueTypeEnum.string,
      value: DatasetSearchModeEnum.embedding
    },
    {
      key: NodeInputKeyEnum.datasetSearchEmbeddingWeight,
      renderTypeList: [FlowNodeInputTypeEnum.hidden],
      label: '',
      valueType: WorkflowIOValueTypeEnum.number,
      value: 0.5
    },
    {
      key: NodeInputKeyEnum.datasetSearchUsingReRank,
      renderTypeList: [FlowNodeInputTypeEnum.hidden],
      label: '',
      valueType: WorkflowIOValueTypeEnum.boolean,
      value: false
    },
    {
      key: NodeInputKeyEnum.datasetSearchRerankModel,
      renderTypeList: [FlowNodeInputTypeEnum.hidden],
      label: '',
      valueType: WorkflowIOValueTypeEnum.string
    },
    {
      key: NodeInputKeyEnum.datasetSearchRerankWeight,
      renderTypeList: [FlowNodeInputTypeEnum.hidden],
      label: '',
      valueType: WorkflowIOValueTypeEnum.number,
      value: 0.5
    },
    {
      key: NodeInputKeyEnum.datasetSearchUsingExtensionQuery,
      renderTypeList: [FlowNodeInputTypeEnum.hidden],
      label: '',
      valueType: WorkflowIOValueTypeEnum.boolean,
      value: true
    },
    {
      key: NodeInputKeyEnum.datasetSearchExtensionModel,
      renderTypeList: [FlowNodeInputTypeEnum.hidden],
      label: '',
      valueType: WorkflowIOValueTypeEnum.string
    },
    {
      key: NodeInputKeyEnum.datasetSearchExtensionBg,
      renderTypeList: [FlowNodeInputTypeEnum.hidden],
      label: '',
      valueType: WorkflowIOValueTypeEnum.string,
      value: ''
    },
    {
      key: NodeInputKeyEnum.authTmbId,
      renderTypeList: [FlowNodeInputTypeEnum.hidden],
      label: '',
      valueType: WorkflowIOValueTypeEnum.boolean,
      value: false
    }
  ],
  outputs: [
    {
      id: NodeOutputKeyEnum.answerText,
      key: NodeOutputKeyEnum.answerText,
      label: i18nT('common:core.module.output.label.Ai response content'),
      description: i18nT('common:core.module.output.description.Ai response content'),
      valueType: WorkflowIOValueTypeEnum.string,
      type: FlowNodeOutputTypeEnum.static
    },
    Output_Template_Error_Message
  ]
};
