import type { AppChatConfigType, VariableItemType } from '../type';
import type { StoreNodeItemType } from '../../workflow/type/node';
import type { StoreEdgeItemType } from '../../workflow/type/edge';
import { FlowNodeTypeEnum, FlowNodeInputTypeEnum } from '../../workflow/node/constant';
import {
  NodeInputKeyEnum,
  NodeOutputKeyEnum,
  WorkflowIOValueTypeEnum
} from '../../workflow/constants';
import { SystemConfigNode } from '../../workflow/template/system/systemConfig';
import {
  WorkflowStart,
  userFilesInput
} from '../../workflow/template/system/workflowStart';
import { AgentNode } from '../../workflow/template/system/agent/index';
import { Input_Template_File_Link } from '../../workflow/template/input';
import { getNanoid } from '../../../common/string/tools';
import { i18nT } from '../../../../web/i18n/utils';
import { VariableInputEnum } from '../../workflow/constants';
import { DatasetSearchModeEnum } from '../../dataset/constants';
import type { SkillManifestType, SkillVariableType } from './type';
import type { SkillToolType } from '../../ai/skill/type';

export type SkillResolvedConfigType = {
  manifest: SkillManifestType;
  variableValues?: Record<string, string>;
  customName?: string;
  customAvatar?: string;
  customIntro?: string;
  selectedToolIds?: string[];
  selectedDatasetIds?: string[];
};

const workflowStartNodeId = 'workflowStartNodeId';
const agentNodeId = 'skillAgentNodeId';

const parseSystemPromptTemplate = ({
  prompt,
  values
}: {
  prompt: string;
  values: Record<string, string>;
}): string => {
  return prompt.replace(/\{\{\s*([a-zA-Z0-9_\-.]+)\s*\}\}/g, (_, key: string) => {
    return values[key] ?? '';
  });
};

const skillVariable2AppVariable = (item: SkillVariableType): VariableItemType => {
  const typeMap: Record<SkillVariableType['type'], VariableInputEnum> = {
    input: VariableInputEnum.input,
    textarea: VariableInputEnum.textarea,
    select: VariableInputEnum.select
  };

  return {
    key: item.key,
    label: item.label,
    type: typeMap[item.type],
    description: item.description || '',
    required: item.required,
    defaultValue: item.defaultValue,
    list: item.options?.map((value) => ({ label: value, value })) || [],
    valueType: WorkflowIOValueTypeEnum.string
  };
};

export const getSkillRuntimeNodes = ({
  config,
  systemPrompt,
  selectedToolIds,
  selectedDatasetIds
}: {
  config: SkillManifestType['config'];
  systemPrompt: string;
  selectedToolIds: string[];
  selectedDatasetIds: string[];
}): {
  nodes: StoreNodeItemType[];
  edges: StoreEdgeItemType[];
} => {
  const selectedTools: SkillToolType[] = selectedToolIds.map((id) => ({
    id,
    config: {}
  }));

  const nodes: StoreNodeItemType[] = [
    {
      nodeId: SystemConfigNode.id,
      name: i18nT('workflow:template.system_config'),
      intro: '',
      flowNodeType: SystemConfigNode.flowNodeType,
      position: { x: 520, y: -480 },
      version: SystemConfigNode.version,
      inputs: [],
      outputs: []
    },
    {
      nodeId: workflowStartNodeId,
      name: i18nT('workflow:template.workflow_start'),
      intro: '',
      avatar: WorkflowStart.avatar,
      flowNodeType: FlowNodeTypeEnum.workflowStart,
      position: { x: 560, y: 120 },
      version: WorkflowStart.version,
      inputs: WorkflowStart.inputs,
      outputs: [...WorkflowStart.outputs, userFilesInput]
    },
    {
      nodeId: agentNodeId,
      name: AgentNode.name,
      intro: AgentNode.intro,
      avatar: AgentNode.avatar,
      flowNodeType: FlowNodeTypeEnum.agent,
      showStatus: true,
      position: { x: 1100, y: -350 },
      version: AgentNode.version,
      inputs: [
        {
          key: NodeInputKeyEnum.aiModel,
          renderTypeList: [FlowNodeInputTypeEnum.settingLLMModel],
          label: i18nT('common:core.module.input.label.aiModel'),
          valueType: WorkflowIOValueTypeEnum.string,
          value: config.model || ''
        },
        {
          key: NodeInputKeyEnum.aiSystemPrompt,
          renderTypeList: [FlowNodeInputTypeEnum.textarea, FlowNodeInputTypeEnum.reference],
          label: i18nT('common:core.ai.Prompt'),
          valueType: WorkflowIOValueTypeEnum.string,
          value: systemPrompt
        },
        {
          ...Input_Template_File_Link,
          value: [[workflowStartNodeId, NodeOutputKeyEnum.userFiles]]
        },
        {
          key: NodeInputKeyEnum.history,
          renderTypeList: [FlowNodeInputTypeEnum.numberInput, FlowNodeInputTypeEnum.reference],
          valueType: WorkflowIOValueTypeEnum.chatHistory,
          label: i18nT('common:core.module.input.label.chat history'),
          required: true,
          min: 0,
          max: 30,
          value: config.maxHistories ?? 6
        },
        {
          key: NodeInputKeyEnum.userChatInput,
          renderTypeList: [FlowNodeInputTypeEnum.reference, FlowNodeInputTypeEnum.textarea],
          valueType: WorkflowIOValueTypeEnum.string,
          label: i18nT('common:core.module.input.label.user question'),
          required: true,
          toolDescription: i18nT('common:core.module.input.label.user question'),
          value: [workflowStartNodeId, NodeInputKeyEnum.userChatInput]
        },
        {
          key: NodeInputKeyEnum.selectedTools,
          renderTypeList: [FlowNodeInputTypeEnum.hidden],
          label: '',
          valueType: WorkflowIOValueTypeEnum.arrayObject,
          value: selectedTools
        },
        {
          key: NodeInputKeyEnum.datasetParams,
          renderTypeList: [FlowNodeInputTypeEnum.hidden],
          label: '',
          valueType: WorkflowIOValueTypeEnum.object,
          value: {
            datasets: selectedDatasetIds.map((datasetId) => ({
              datasetId,
              avatar: '/icon/logo.svg',
              name: datasetId,
              vectorModel: { model: '' }
            })),
            similarity: 0.4,
            limit: 3000,
            searchMode: DatasetSearchModeEnum.embedding,
            usingReRank: true,
            rerankWeight: 0.5,
            datasetSearchUsingExtensionQuery: true,
            datasetSearchExtensionBg: ''
          }
        }
      ],
      outputs: AgentNode.outputs
    }
  ];

  const edges: StoreEdgeItemType[] = [
    {
      source: workflowStartNodeId,
      target: agentNodeId,
      sourceHandle: `${workflowStartNodeId}-source-right`,
      targetHandle: `${agentNodeId}-target-left`
    }
  ];

  return {
    nodes,
    edges
  };
};

export const skillManifest2AppConfig = ({
  manifest,
  variableValues = {},
  customName,
  customAvatar,
  customIntro,
  selectedToolIds,
  selectedDatasetIds
}: SkillResolvedConfigType): {
  name: string;
  avatar: string;
  intro: string;
  modules: StoreNodeItemType[];
  edges: StoreEdgeItemType[];
  chatConfig: AppChatConfigType;
} => {
  const systemPrompt = parseSystemPromptTemplate({
    prompt: manifest.config.systemPrompt,
    values: variableValues
  });

  const toolIds = selectedToolIds ?? manifest.config.tools;
  const datasetIds = selectedDatasetIds ?? manifest.config.datasetIds ?? [];

  const { nodes, edges } = getSkillRuntimeNodes({
    config: manifest.config,
    systemPrompt,
    selectedToolIds: toolIds,
    selectedDatasetIds: datasetIds
  });

  return {
    name: customName || manifest.name,
    avatar: customAvatar || manifest.avatar,
    intro: customIntro || manifest.description,
    modules: nodes,
    edges,
    chatConfig: {
      variables: manifest.config.variables.map(skillVariable2AppVariable)
    }
  };
};

export const getSkillDefaultAppName = (manifest: SkillManifestType) => {
  return `${manifest.name}-${getNanoid(4)}`;
};
