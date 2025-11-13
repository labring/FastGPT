import type { NodeOutputItemType } from '../../../../chat/type';
import type { FlowNodeOutputItemType } from '../../../type/io';
import type { FlowNodeInputTypeEnum } from 'core/workflow/node/constant';
import type { WorkflowIOValueTypeEnum } from 'core/workflow/constants';
import type { ChatCompletionMessageParam } from '../../../../ai/type';

type InteractiveBasicType = {
  entryNodeIds: string[];
  memoryEdges: RuntimeEdgeItemType[];
  nodeOutputs: NodeOutputItemType[];
  skipNodeQueue?: { id: string; skippedNodeIdList: string[] }[]; // 需要记录目前在 queue 里的节点

  usageId?: string;
};

type InteractiveNodeType = {
  entryNodeIds?: string[];
  memoryEdges?: RuntimeEdgeItemType[];
  nodeOutputs?: NodeOutputItemType[];
};

type ChildrenInteractive = InteractiveNodeType & {
  type: 'childrenInteractive';
  params: {
    childrenResponse: WorkflowInteractiveResponseType;
  };
};
type ToolCallChildrenInteractive = InteractiveNodeType & {
  type: 'toolChildrenInteractive';
  params: {
    childrenResponse: WorkflowInteractiveResponseType;
    toolParams: {
      memoryRequestMessages: ChatCompletionMessageParam[]; // 这轮工具中，产生的新的 messages
      toolCallId: string; // 记录对应 tool 的id，用于后续交互节点可以替换掉 tool 的 response
    };
  };
};

// Loop bode
type LoopInteractive = InteractiveNodeType & {
  type: 'loopInteractive';
  params: {
    loopResult: any[];
    childrenResponse: WorkflowInteractiveResponseType;
    currentIndex: number;
  };
};

export type UserSelectOptionItemType = {
  key: string;
  value: string;
};
type UserSelectInteractive = InteractiveNodeType & {
  type: 'userSelect';
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
type UserInputInteractive = InteractiveNodeType & {
  type: 'userInput';
  params: {
    description: string;
    inputForm: UserInputFormItemType[];
    submitted?: boolean;
  };
};

// 欠费暂停交互
export type PaymentPauseInteractive = InteractiveNodeType & {
  type: 'paymentPause';
  params: {
    description?: string;
    continue?: boolean;
  };
};

export type InteractiveNodeResponseType =
  | UserSelectInteractive
  | UserInputInteractive
  | ChildrenInteractive
  | ToolCallChildrenInteractive
  | LoopInteractive
  | PaymentPauseInteractive;

export type WorkflowInteractiveResponseType = InteractiveBasicType & InteractiveNodeResponseType;
