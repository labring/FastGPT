import type { localeType } from '@fastgpt/global/common/i18n/type';
import type { AppSchemaType } from '@fastgpt/global/core/app/type';
import type { ReasoningEffort } from '@fastgpt/global/core/ai/llm/type';
import type { AiChatQuoteRoleType } from '@fastgpt/global/core/workflow/template/system/aiChat/type';
import type {
  InteractiveNodeResponseType,
  WorkflowInteractiveResponseType
} from '@fastgpt/global/core/workflow/template/system/interactive/type';
import type { RuntimeEdgeItemType } from '@fastgpt/global/core/workflow/type/edge';
import type {
  AIChatItemValueItemType,
  ChatFileStoreValue,
  ChatHistoryItemResType,
  ChatItemMiniType,
  ToolRunResponseItemType,
  UserChatItemValueItemType
} from '@fastgpt/global/core/chat/type';
import type { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import type { OpenaiAccountType } from '@fastgpt/global/support/user/team/type';
import type { ChatNodeUsageType } from '@fastgpt/global/support/wallet/bill/type';
import type { NodeHttpResponse } from '../../../types/http';
import type { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import type { WorkflowResponseType } from '@fastgpt/global/core/workflow/runtime/sse';
import type {
  DispatchNodeResponseType,
  RuntimeNodeItemType
} from '@fastgpt/global/core/workflow/runtime/type';
import type { NodeInputKeyEnum, NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';

/*
  1. 输入线分类：普通线(实际上就是从 start 直接过来的分支）和递归线（可以追溯到自身的分支）
  2. 递归线，会根据最近的一个 target 分支进行分类，同一个分支的属于一组
  2. 起始线全部非 waiting 执行，或递归线任意一组全部非 waiting 执行
*/
// 节点边分组结构（简化版：不再区分 common 和 recursive）
export type NodeEdgeGroups = RuntimeEdgeItemType[][]; // 二维数组，每组代表一个独立的逻辑路径

// 预构建的 Map
export type NodeEdgeGroupsMap = Map<string, NodeEdgeGroups>;

export type ExternalProviderType = {
  openaiAccount?: OpenaiAccountType;
  externalWorkflowVariables?: Record<string, string>;
};

export type WorkflowVariableStateLike = {
  get: (key: string) => unknown;
  set: (key: string, value: unknown) => Promise<unknown>;
  getStoreValue: (key: string) => unknown;
  getFileStoreValueByRuntimeUrl: (url: string) => ChatFileStoreValue | undefined;
  toRuntimeRecord: () => Record<string, unknown>;
  toStoreRecord: () => Record<string, unknown>;
  clone: () => WorkflowVariableStateLike;
};

/* workflow props */
export type ChatDispatchProps = {
  res?: NodeHttpResponse;
  checkIsStopping: () => boolean;
  lang?: localeType;
  requestOrigin?: string;
  mode: 'test' | 'chat' | 'debug';
  timezone: string;
  externalProvider: ExternalProviderType;

  runningAppInfo: {
    sourceType: ChatSourceTypeEnum;
    sourceId: string;
    teamId: string;
    tmbId: string; // App tmbId
    name: string;
    isChildApp?: boolean;
  };
  runningUserInfo: {
    username: string;
    teamName: string;
    memberName: string;
    contact: string;
    teamId: string;
    tmbId: string;
  };
  uid: string; // Who run this workflow

  chatId: string;
  /** 当前 AI 回复 chat item 的 dataId；workflow 运行期必须有值，外部入口缺省时由 dispatchWorkFlow 补齐。 */
  responseChatItemId: string;
  histories: ChatItemMiniType[];
  variableState: WorkflowVariableStateLike; // global variable state
  query: UserChatItemValueItemType[]; // trigger query
  chatConfig: AppSchemaType['chatConfig'];
  lastInteractive?: WorkflowInteractiveResponseType; // last interactive response
  stream: boolean;
  retainDatasetCite?: boolean;
  showSkillReferences?: boolean;
  maxRunTimes: number;
  isToolCall?: boolean;
  workflowStreamResponse?: WorkflowResponseType;
  apiVersion?: 'v1' | 'v2';

  workflowDispatchDeep: number;

  responseAllData?: boolean;
  responseDetail?: boolean;
  nodeResponseParentId?: string; // 传递给 child，用于设置 nodeResponse 的 parentId

  // TODO: 移除
  usageId?: string;
};

export type ModuleDispatchProps<T> = ChatDispatchProps & {
  node: RuntimeNodeItemType;
  runtimeNodes: RuntimeNodeItemType[];
  runtimeNodesMap: Map<string, RuntimeNodeItemType>;
  runtimeEdges: RuntimeEdgeItemType[];
  params: T;

  usagePush: (usages: ChatNodeUsageType[]) => void;
};

export type SystemVariablesType = {
  userId: string;
  appId?: string;
  chatId?: string;
  responseChatItemId?: string;
  histories: ChatItemMiniType[];
  cTime: string;
};

export type DispatchNodeResultType<
  T = Record<string, never>,
  ERR = {
    [NodeOutputKeyEnum.errorText]?: string;
  }
> = {
  [DispatchNodeResponseKeyEnum.answerText]?: string;
  [DispatchNodeResponseKeyEnum.reasoningText]?: string;
  [DispatchNodeResponseKeyEnum.skipHandleId]?: string[]; // skip some edge handle id
  [DispatchNodeResponseKeyEnum.nodeResponse]?: DispatchNodeResponseType; // The node response detail
  [DispatchNodeResponseKeyEnum.nodeResponses]?: ChatHistoryItemResType[]; // 内部 n 个节点平铺；dispatch/index 不会把自身节点混入这里
  [DispatchNodeResponseKeyEnum.childrenResponses]?: DispatchNodeResultType[]; // Children node response
  [DispatchNodeResponseKeyEnum.toolResponse]?: ToolRunResponseItemType; // Tool response
  [DispatchNodeResponseKeyEnum.assistantResponses]?: AIChatItemValueItemType[]; // Assistant response(Store to db)
  [DispatchNodeResponseKeyEnum.rewriteHistories]?: ChatItemMiniType[];
  [DispatchNodeResponseKeyEnum.runTimes]?: number;
  [DispatchNodeResponseKeyEnum.memories]?: Record<string, any>;
  [DispatchNodeResponseKeyEnum.interactive]?: InteractiveNodeResponseType;
  [DispatchNodeResponseKeyEnum.customFeedbacks]?: string[];

  data?: T;
  error?: ERR & { [NodeOutputKeyEnum.errorText]?: string };

  /** @deprecated */
  [DispatchNodeResponseKeyEnum.nodeDispatchUsages]?: ChatNodeUsageType[]; // Node total usage
};

/* Single node props */
export type AIChatNodeProps = {
  [NodeInputKeyEnum.aiModel]: string;
  [NodeInputKeyEnum.aiSystemPrompt]?: string;
  [NodeInputKeyEnum.aiChatTemperature]?: number;
  [NodeInputKeyEnum.aiChatMaxToken]?: number;
  [NodeInputKeyEnum.aiChatIsResponseText]: boolean;
  [NodeInputKeyEnum.aiChatVision]?: boolean;
  [NodeInputKeyEnum.aiChatAudio]?: boolean;
  [NodeInputKeyEnum.aiChatVideo]?: boolean;
  [NodeInputKeyEnum.aiChatExtractFiles]?: boolean;
  [NodeInputKeyEnum.aiChatReasoning]?: boolean;
  [NodeInputKeyEnum.aiChatReasoningEffort]?: ReasoningEffort;
  [NodeInputKeyEnum.aiChatTopP]?: number;
  [NodeInputKeyEnum.aiChatStopSign]?: string;
  [NodeInputKeyEnum.aiChatResponseFormat]?: string;
  [NodeInputKeyEnum.aiChatJsonSchema]?: string;

  [NodeInputKeyEnum.aiChatQuoteRole]?: AiChatQuoteRoleType;
  [NodeInputKeyEnum.aiChatQuoteTemplate]?: string;
  [NodeInputKeyEnum.aiChatQuotePrompt]?: string;

  [NodeInputKeyEnum.stringQuoteText]?: string;
  [NodeInputKeyEnum.fileUrlList]?: string[];
};
