import type { NodeOutputItemType } from '../../../../chat/type';
import type { FlowNodeInputTypeEnum } from '../../../../../core/workflow/node/constant';
import type { WorkflowIOValueTypeEnum } from '../../../../../core/workflow/constants';
import type { ChatCompletionMessageParam } from '../../../../ai/type';
import type { RuntimeEdgeItemType } from '../../../type/edge';

export type InteractiveBasicType = {
  entryNodeIds: string[];
  memoryEdges: RuntimeEdgeItemType[];
  nodeOutputs: NodeOutputItemType[];
  skipNodeQueue?: { id: string; skippedNodeIdList: string[] }[]; // 需要记录目前在 queue 里的节点
  toolParams?: {
    entryNodeIds: string[]; // 记录工具中，交互节点的 Id，而不是起始工作流的入口
    memoryMessages: ChatCompletionMessageParam[]; // 这轮工具中，产生的新的 messages
    toolCallId: string; // 记录对应 tool 的id，用于后续交互节点可以替换掉 tool 的 response
  };
};

type InteractiveNodeType = {
  entryNodeIds?: string[];
  memoryEdges?: RuntimeEdgeItemType[];
  nodeOutputs?: NodeOutputItemType[];
};

type ChildrenInteractive = InteractiveNodeType & {
  type: 'childrenInteractive';
  params: {
    childrenResponse?: WorkflowInteractiveResponseType;
  };
};

type LoopInteractive = InteractiveNodeType & {
  type: 'loopInteractive';
  params: {
    loopResult: any[];
    childrenResponse: WorkflowInteractiveResponseType;
    currentIndex: number;
  };
};

// Agent Interactive
export type AgentPlanCheckInteractive = InteractiveNodeType & {
  type: 'agentPlanCheck';
  params: {
    confirmed?: boolean;
  };
};
export type AgentPlanAskQueryInteractive = InteractiveNodeType & {
  type: 'agentPlanAskQuery';
  params: {
    content: string;
  };
};

export type UserSelectOptionItemType = {
  key: string;
  value: string;
};
export type UserSelectInteractive = InteractiveNodeType & {
  type: 'userSelect' | 'agentPlanAskUserSelect';
  params: {
    description: string;
    userSelectOptions: UserSelectOptionItemType[];
    userSelectedVal?: string;
  };
};

export type UserInputFormItemType = {
  type: FlowNodeInputTypeEnum;
  key: string;
  label: string;
  value: any;
  valueType: WorkflowIOValueTypeEnum;
  description?: string;
  defaultValue?: any;
  required: boolean;

  // input & textarea
  maxLength?: number;
  // numberInput
  max?: number;
  min?: number;
  // select
  list?: { label: string; value: string }[];
};
export type UserInputInteractive = InteractiveNodeType & {
  type: 'userInput' | 'agentPlanAskUserForm';
  params: {
    description: string;
    inputForm: UserInputFormItemType[];
    submitted?: boolean;
  };
};

export type InteractiveNodeResponseType =
  | UserSelectInteractive
  | UserInputInteractive
  | ChildrenInteractive
  | LoopInteractive
  | AgentPlanCheckInteractive
  | AgentPlanAskQueryInteractive;

export type WorkflowInteractiveResponseType = InteractiveBasicType & InteractiveNodeResponseType;
