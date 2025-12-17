import { NodeOutputItemSchema } from '../../../../chat/type';
import { FlowNodeInputTypeEnum } from '../../../../../core/workflow/node/constant';
import { WorkflowIOValueTypeEnum } from '../../../../../core/workflow/constants';
import type { ChatCompletionMessageParam } from '../../../../ai/type';
import { AppFileSelectConfigTypeSchema } from '../../../../app/type/config';
import { RuntimeEdgeItemTypeSchema } from '../../../type/edge';
import z from 'zod';

export const InteractiveBasicTypeSchema = z.object({
  entryNodeIds: z.array(z.string()),
  memoryEdges: z.array(RuntimeEdgeItemTypeSchema),
  nodeOutputs: z.array(NodeOutputItemSchema),
  skipNodeQueue: z
    .array(z.object({ id: z.string(), skippedNodeIdList: z.array(z.string()) }))
    .optional(), // 需要记录目前在 queue 里的节点
  usageId: z.string().optional()
});
export type InteractiveBasicType = z.infer<typeof InteractiveBasicTypeSchema>;

const InteractiveNodeTypeSchema = z.object({
  entryNodeIds: z.array(z.string()).optional(),
  memoryEdges: z.array(RuntimeEdgeItemTypeSchema).optional(),
  nodeOutputs: z.array(NodeOutputItemSchema).optional()
});
export type InteractiveNodeType = z.infer<typeof InteractiveNodeTypeSchema>;

export const ChildrenInteractiveSchema = z.object({
  type: z.literal('childrenInteractive'),
  params: z.object({
    childrenResponse: z.any()
  })
});
export type ChildrenInteractive = InteractiveNodeType & {
  type: 'childrenInteractive';
  params: {
    childrenResponse: WorkflowInteractiveResponseType;
  };
};

export const ToolCallChildrenInteractiveSchema = z.object({
  type: z.literal('toolChildrenInteractive'),
  params: z.object({
    childrenResponse: z.any(),
    toolParams: z.object({
      memoryRequestMessages: z.array(z.any()), // 这轮工具中，产生的新的 messages
      toolCallId: z.string() // 记录对应 tool 的id，用于后续交互节点可以替换掉 tool 的 response
    })
  })
});
export type ToolCallChildrenInteractive = InteractiveNodeType & {
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
export const LoopInteractiveSchema = z.object({
  type: z.literal('loopInteractive'),
  params: z.object({
    loopResult: z.array(z.any()),
    childrenResponse: z.any(),
    currentIndex: z.number()
  })
});
export type LoopInteractive = InteractiveNodeType & {
  type: 'loopInteractive';
  params: {
    loopResult: any[];
    childrenResponse: WorkflowInteractiveResponseType;
    currentIndex: number;
  };
};

// Agent Interactive
export const AgentPlanCheckInteractiveSchema = z.object({
  type: z.literal('agentPlanCheck'),
  params: z.object({
    confirmed: z.boolean().optional()
  })
});
export type AgentPlanCheckInteractive = z.infer<typeof AgentPlanCheckInteractiveSchema>;

export const AgentPlanAskQueryInteractiveSchema = z.object({
  type: z.literal('agentPlanAskQuery'),
  params: z.object({
    content: z.string()
  })
});
export type AgentPlanAskQueryInteractive = z.infer<typeof AgentPlanAskQueryInteractiveSchema>;

// User selector
export const UserSelectOptionItemSchema = z.object({
  key: z.string(),
  value: z.string()
});
export type UserSelectOptionItemType = z.infer<typeof UserSelectOptionItemSchema>;
export const UserSelectInteractiveSchema = z.object({
  type: z.literal('userSelect').or(z.literal('agentPlanAskUserSelect')),
  params: z.object({
    description: z.string(),
    userSelectOptions: z.array(UserSelectOptionItemSchema),
    userSelectedVal: z.string().optional()
  })
});
export type UserSelectInteractive = z.infer<typeof UserSelectInteractiveSchema>;

// User input
export const UserInputFormItemSchema = AppFileSelectConfigTypeSchema.and(
  z.object({
    type: z.enum(FlowNodeInputTypeEnum),
    key: z.string(),
    label: z.string(),
    value: z.any(),
    valueType: z.enum(WorkflowIOValueTypeEnum),
    description: z.string().optional(),
    defaultValue: z.any().optional(),
    required: z.boolean(),

    maxLength: z.number().optional(), // input & textarea
    minLength: z.number().optional(), // password
    max: z.number().optional(), // numberInput
    min: z.number().optional(), // numberInput
    list: z.array(z.object({ label: z.string(), value: z.string() })).optional() // select
  })
);
export type UserInputFormItemType = z.infer<typeof UserInputFormItemSchema>;
export const UserInputInteractiveSchema = z.object({
  type: z.literal('userInput').or(z.literal('agentPlanAskUserForm')),
  params: z.object({
    description: z.string(),
    inputForm: z.array(UserInputFormItemSchema),
    submitted: z.boolean().optional()
  })
});
export type UserInputInteractive = z.infer<typeof UserInputInteractiveSchema>;

// 欠费暂停交互
export const PaymentPauseInteractiveSchema = z.object({
  type: z.literal('paymentPause'),
  params: z.object({
    description: z.string().optional(),
    continue: z.boolean().optional()
  })
});
export type PaymentPauseInteractive = z.infer<typeof PaymentPauseInteractiveSchema>;

export const InteractiveNodeResponseTypeSchema = z.union([
  UserSelectInteractiveSchema,
  UserInputInteractiveSchema,
  ChildrenInteractiveSchema,
  ToolCallChildrenInteractiveSchema,
  LoopInteractiveSchema,
  PaymentPauseInteractiveSchema,
  AgentPlanCheckInteractiveSchema,
  AgentPlanAskQueryInteractiveSchema
]);
export type InteractiveNodeResponseType = z.infer<typeof InteractiveNodeResponseTypeSchema>;

export const WorkflowInteractiveResponseTypeSchema = InteractiveBasicTypeSchema.and(
  InteractiveNodeResponseTypeSchema
);
export type WorkflowInteractiveResponseType = z.infer<typeof WorkflowInteractiveResponseTypeSchema>;
