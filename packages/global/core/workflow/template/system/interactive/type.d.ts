import type { NodeOutputItemType } from '../../../../chat/type';
import type { FlowNodeOutputItemType } from '../../../type/io';
import type { RuntimeEdgeItemType } from '../../../runtime/type';
import { FlowNodeInputTypeEnum } from 'core/workflow/node/constant';
import { WorkflowIOValueTypeEnum } from 'core/workflow/constants';
import type { ChatCompletionMessageParam } from '../../../../ai/type';

export type UserSelectOptionItemType = {
  key: string;
  value: string;
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

type InteractiveBasicType = {
  entryNodeIds: string[];
  memoryEdges: RuntimeEdgeItemType[];
  nodeOutputs: NodeOutputItemType[];

  toolParams?: {
    entryNodeIds: string[]; // 记录工具中，交互节点的 Id，而不是起始工作流的入口
    memoryMessages: ChatCompletionMessageParam[]; // 这轮工具中，产生的新的 messages
    toolCallId: string; // 记录对应 tool 的id，用于后续交互节点可以替换掉 tool 的 response
  };
};

type UserSelectInteractive = {
  type: 'userSelect';
  params: {
    description: string;
    userSelectOptions: UserSelectOptionItemType[];
    userSelectedVal?: string;
  };
};

type UserInputInteractive = {
  type: 'userInput';
  params: {
    description: string;
    inputForm: UserInputFormItemType[];
    submitted?: boolean;
  };
};

export type InteractiveNodeResponseType = UserSelectInteractive | UserInputInteractive;
export type WorkflowInteractiveResponseType = InteractiveBasicType & InteractiveNodeResponseType;
