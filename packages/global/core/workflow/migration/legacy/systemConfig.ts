import type {
  AppAutoExecuteConfigType,
  AppChatConfigType,
  AppQGConfigType,
  AppScheduledTriggerConfigType,
  AppTTSConfigType,
  AppWelcomeConfigType,
  AppWhisperConfigType,
  ChatInputGuideConfigType,
  VariableItemType
} from '../../../app/type';
import { defaultQGConfig } from '../../../app/constants';
import { NodeInputKeyEnum } from '../../constants';
import type { StoreEdgeItemType } from '../../type/edge';
import type { StoreNodeItemType } from '../../type/node';
import type { LegacyStoreNodeItem, LegacyWorkflowData, LegacyWorkflowDataInput } from './schema';

/**
 * Legacy `FlowNodeTypeEnum.systemConfig`.
 */
const legacySystemConfigNodeType = 'userGuide';
/**
 * Legacy `FlowNodeTypeEnum.pluginConfig`.
 */
const legacyPluginConfigNodeType = 'pluginConfig';

type CurrentWorkflowData = {
  nodes: StoreNodeItemType[];
  edges?: StoreEdgeItemType[];
  chatConfig?: AppChatConfigType;
};

const isConfigMissing = (value: unknown) => value === undefined || value === null;

const getSystemConfigInputValue = <T>(node: LegacyStoreNodeItem | undefined, key: string) =>
  node?.inputs.find((input) => input.key === key)?.value as T | undefined;

/**
 * 将已废弃系统配置节点的值合并进当前 chatConfig，并删除节点及关联边。
 */
export function migrateSystemConfigToChatConfig(input: CurrentWorkflowData): {
  nodes: StoreNodeItemType[];
  edges: StoreEdgeItemType[];
  chatConfig: AppChatConfigType;
};
export function migrateSystemConfigToChatConfig(input: LegacyWorkflowDataInput): {
  nodes: LegacyStoreNodeItem[];
  edges: StoreEdgeItemType[];
  chatConfig: AppChatConfigType;
};
export function migrateSystemConfigToChatConfig(input: LegacyWorkflowDataInput) {
  const legacyInput = input as LegacyWorkflowData;
  const systemConfigNode = legacyInput.nodes.find(
    (node) => node.flowNodeType === legacySystemConfigNodeType
  );
  const pluginConfigNode = legacyInput.nodes.find(
    (node) => node.flowNodeType === legacyPluginConfigNodeType
  );
  // 旧 chatConfig 可能直接保存 questionGuide 布尔值；canonical 结构要求配置对象。
  // 保留默认配置，仅用历史布尔值覆盖 open 字段。
  const { questionGuide: legacyQuestionGuide, ...legacyChatConfig } = legacyInput.chatConfig ?? {};
  const chatConfig: AppChatConfigType = {
    ...legacyChatConfig,
    questionGuide:
      typeof legacyQuestionGuide === 'boolean'
        ? { ...defaultQGConfig, open: legacyQuestionGuide }
        : legacyQuestionGuide
  };
  const welcomeConfig: AppWelcomeConfigType = { ...(chatConfig.welcomeConfig ?? {}) };
  const welcomeText = getSystemConfigInputValue<string>(
    systemConfigNode,
    NodeInputKeyEnum.welcomeText
  );
  const welcomeQuestions = getSystemConfigInputValue<string[]>(
    systemConfigNode,
    NodeInputKeyEnum.welcomeQuestions
  );

  if (isConfigMissing(welcomeConfig.welcomeText) && !isConfigMissing(chatConfig.welcomeText)) {
    welcomeConfig.welcomeText = chatConfig.welcomeText;
  }
  if (isConfigMissing(welcomeConfig.welcomeText) && !isConfigMissing(welcomeText)) {
    welcomeConfig.welcomeText = welcomeText;
  }
  if (isConfigMissing(welcomeConfig.welcomeQuestions) && !isConfigMissing(welcomeQuestions)) {
    welcomeConfig.welcomeQuestions = welcomeQuestions;
  }
  if (
    !isConfigMissing(welcomeConfig.welcomeText) ||
    !isConfigMissing(welcomeConfig.welcomeQuestions)
  ) {
    chatConfig.welcomeConfig = welcomeConfig;
    chatConfig.welcomeText = welcomeConfig.welcomeText;
  }

  const variables = getSystemConfigInputValue<VariableItemType[]>(
    systemConfigNode,
    NodeInputKeyEnum.variables
  );
  const configValues: Array<[keyof AppChatConfigType, unknown]> = [
    [
      'variables',
      variables?.map((variable) => ({
        ...variable,
        description: variable.description ?? ''
      }))
    ],
    [
      'questionGuide',
      (() => {
        const value = getSystemConfigInputValue<AppQGConfigType | boolean>(
          systemConfigNode,
          NodeInputKeyEnum.questionGuide
        );
        return typeof value === 'boolean' ? { ...defaultQGConfig, open: value } : value;
      })()
    ],
    [
      'ttsConfig',
      getSystemConfigInputValue<AppTTSConfigType>(systemConfigNode, NodeInputKeyEnum.tts)
    ],
    [
      'whisperConfig',
      getSystemConfigInputValue<AppWhisperConfigType>(systemConfigNode, NodeInputKeyEnum.whisper)
    ],
    [
      'scheduledTriggerConfig',
      getSystemConfigInputValue<AppScheduledTriggerConfigType>(
        systemConfigNode,
        NodeInputKeyEnum.scheduleTrigger
      )
    ],
    [
      'chatInputGuide',
      getSystemConfigInputValue<ChatInputGuideConfigType>(
        systemConfigNode,
        NodeInputKeyEnum.chatInputGuide
      )
    ],
    [
      'autoExecute',
      getSystemConfigInputValue<AppAutoExecuteConfigType>(
        systemConfigNode,
        NodeInputKeyEnum.autoExecute
      )
    ]
  ];
  configValues.forEach(([key, value]) => {
    if (isConfigMissing(chatConfig[key]) && !isConfigMissing(value)) {
      Object.assign(chatConfig, { [key]: value });
    }
  });

  const instruction = getSystemConfigInputValue<string>(
    systemConfigNode,
    NodeInputKeyEnum.instruction
  );
  const pluginInstruction = getSystemConfigInputValue<string>(
    pluginConfigNode,
    NodeInputKeyEnum.instruction
  );
  // 旧 instruction 可能位于 userGuide 或 pluginConfig 节点；优先 userGuide，当前值优先保留。
  // 两个旧节点均无值时跳过赋值，避免把 undefined 写入 canonical chatConfig。
  const legacyInstruction = instruction ?? pluginInstruction;
  if (isConfigMissing(chatConfig.instruction) && !isConfigMissing(legacyInstruction)) {
    chatConfig.instruction = legacyInstruction;
  }

  const removedNodeIds = new Set(
    legacyInput.nodes
      .filter(
        (node) =>
          node.flowNodeType === legacySystemConfigNodeType ||
          node.flowNodeType === legacyPluginConfigNodeType
      )
      .map((node) => node.nodeId)
  );

  return {
    nodes: legacyInput.nodes.filter((node) => !removedNodeIds.has(node.nodeId)),
    edges: (legacyInput.edges ?? []).filter(
      (edge) => !removedNodeIds.has(edge.source) && !removedNodeIds.has(edge.target)
    ),
    chatConfig
  };
}
