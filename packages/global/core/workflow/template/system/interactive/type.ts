import { NodeOutputItemSchema } from '../../../runtime/type';
import { FlowNodeInputTypeEnum } from '../../../../../core/workflow/node/constant';
import { WorkflowIOValueTypeEnum } from '../../../../../core/workflow/constants';
import { AppFileSelectConfigTypeSchema } from '../../../../app/type/config.schema';
import { RuntimeEdgeItemTypeSchema } from '../../../type/edge';
import z from 'zod';
import { ChatCompletionMessageParamSchema } from '../../../../ai/llm/type';
import { AgentAskQuestionSchema } from '../../../../ai/agent/type';

export const InteractiveBasicTypeSchema = z.object({
  entryNodeIds: z.array(z.string()),
  interactiveId: z.string().optional(),
  nodeResponseId: z.string().optional(),
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
  interactiveId: z.string().optional(),
  nodeResponseId: z.string().optional(),
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
      // 兼容旧历史：新交互不再持久化完整 messages 快照，恢复时由 chat history 重建。
      memoryRequestMessages: z.array(ChatCompletionMessageParamSchema).optional(),
      toolCallId: z.string() // 记录对应 tool 的id，用于后续交互节点可以替换掉 tool 的 response
    })
  })
});
export type ToolCallChildrenInteractive = InteractiveNodeType &
  z.infer<typeof ToolCallChildrenInteractiveSchema>;

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

export const LoopRunInteractiveSchema = z.object({
  type: z.literal('loopRunInteractive'),
  params: z.object({
    loopHistory: z.array(z.any()),
    childrenResponse: z.any(),
    iteration: z.number(),
    pendingIterationSummary: z.any().optional()
  })
});
export type LoopRunInteractive = InteractiveNodeType & {
  type: 'loopRunInteractive';
  params: {
    loopHistory: any[];
    childrenResponse: WorkflowInteractiveResponseType;
    iteration: number;
    pendingIterationSummary?: Record<string, any>;
  };
};

export const AgentPlanAskOptionSchema = z.union([
  z.string().trim().min(1),
  z
    .object({
      value: z.string().trim().min(1),
      label: z.string().trim().min(1),
      inputMode: z.enum(['none', 'text']).optional(),
      inputPlaceholder: z.string().trim().min(1).optional()
    })
    .strict()
]);
export type AgentPlanAskOption = z.infer<typeof AgentPlanAskOptionSchema>;

export const AgentPlanAskResponseSchema = z
  .object({
    askId: z.string().min(1),
    optionValue: z.string().min(1),
    text: z.string().trim().min(1).optional()
  })
  .strict();
export type AgentPlanAskResponse = z.infer<typeof AgentPlanAskResponseSchema>;

/**
 * Legacy `ask_user` schema.
 *
 * @deprecated Use `AgentAskInteractiveSchema` (multiple questions).
 */
export const AgentPlanAskQueryInteractiveSchema = z
  .object({
    type: z.literal('agentPlanAskQuery'),
    askId: z.string().min(1),
    params: z.object({
      content: z.string(),
      reason: z.string().optional(),
      blockerType: z
        .enum(['missing_required_input', 'tool_unavailable', 'ambiguous_goal', 'user_choice'])
        .optional(),
      options: z.array(AgentPlanAskOptionSchema).min(2).max(5),
      answer: z.string().optional()
    })
  })
  .meta({
    deprecated: true
  });

/**
 * @deprecated Use `AgentAskInteractiveSchema` (multiple questions).
 */
export type AgentPlanAskQueryInteractive = z.infer<typeof AgentPlanAskQueryInteractiveSchema>;

export const WorkflowBuilderPreviewActionSchema = z.object({
  value: z.enum(['confirm', 'revise', 'cancel']),
  label: z.string().trim().min(1),
  inputMode: z.enum(['none', 'text']),
  inputPlaceholder: z.string().trim().min(1).optional()
});
export type WorkflowBuilderPreviewAction = z.infer<typeof WorkflowBuilderPreviewActionSchema>;

export const WorkflowBuilderPreviewSectionSchema = z.object({
  title: z.string().trim().min(1),
  content: z.string()
});
export type WorkflowBuilderPreviewSection = z.infer<typeof WorkflowBuilderPreviewSectionSchema>;

/**
 * Workflow Builder 的唯一预览载荷。
 * Mermaid、说明和用户动作都挂在同一个交互节点上，避免 assistant 文本与预览字段各自维护一份方案。
 */
export const WorkflowBuilderPreviewInteractiveSchema = z.object({
  type: z.literal('workflowBuilderPreview'),
  previewId: z.string().min(1),
  params: z.object({
    title: z.string().trim().min(1),
    mermaid: z.string().trim().min(1),
    sections: z.array(WorkflowBuilderPreviewSectionSchema),
    actions: z.array(WorkflowBuilderPreviewActionSchema).length(3),
    answerValue: z.enum(['confirm', 'revise', 'cancel']).optional(),
    answerText: z.string().optional()
  })
});
export type WorkflowBuilderPreviewInteractive = z.infer<
  typeof WorkflowBuilderPreviewInteractiveSchema
>;

// User selector
export const UserSelectOptionItemSchema = z.object({
  key: z.string(),
  value: z.string()
});
export type UserSelectOptionItemType = z.infer<typeof UserSelectOptionItemSchema>;
export const UserSelectInteractiveSchema = z.object({
  type: z.literal('userSelect'),
  params: z.object({
    description: z.string(),
    userSelectOptions: z.array(UserSelectOptionItemSchema),
    userSelectedVal: z.string().optional()
  })
});
export type UserSelectInteractive = z.infer<typeof UserSelectInteractiveSchema>;

// User input
export const UserInputFormItemSchema = AppFileSelectConfigTypeSchema.extend({
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
  list: z.array(z.object({ label: z.string(), value: z.string() })).optional(), // select

  canLocalUpload: z.boolean().optional(),
  canUrlUpload: z.boolean().optional()
});
export type UserInputFormItemType = z.infer<typeof UserInputFormItemSchema>;
export const UserInputInteractiveSchema = z.object({
  type: z.literal('userInput'),
  params: z.object({
    // 表单节点未配置说明时，运行时 JSON 会省略 undefined；展示不依赖该字段。
    description: z.string().optional(),
    inputForm: z.array(UserInputFormItemSchema),
    submitted: z.boolean().optional()
  })
});
export type UserInputInteractive = z.infer<typeof UserInputInteractiveSchema>;

export const AgentAskQuestionInteractiveSchema = AgentAskQuestionSchema.safeExtend({
  answer: z.string()
});
export type AgentAskQuestionInteractive = z.infer<typeof AgentAskQuestionInteractiveSchema>;

export const AgentAskInteractiveSchema = z.object({
  type: z.literal('agentAsk'),
  askId: z.string().min(1),
  responseMode: z.literal('submit').optional(),
  params: z.object({
    description: z.string(),
    questions: z.array(AgentAskQuestionInteractiveSchema).min(1).max(3),
    submitted: z.boolean().optional()
  })
});
export type AgentAskInteractive = z.infer<typeof AgentAskInteractiveSchema>;

// 欠费暂停交互
export const PaymentPauseInteractiveSchema = z.object({
  type: z.literal('paymentPause'),
  params: z.object({
    description: z.string().optional(),
    continue: z.boolean().optional()
  })
});
export type PaymentPauseInteractive = z.infer<typeof PaymentPauseInteractiveSchema>;

export const InteractiveNodeResponseTypeSchema = z.intersection(
  z.discriminatedUnion('type', [
    UserSelectInteractiveSchema,
    UserInputInteractiveSchema,
    ChildrenInteractiveSchema,
    ToolCallChildrenInteractiveSchema,
    LoopInteractiveSchema,
    LoopRunInteractiveSchema,
    PaymentPauseInteractiveSchema,
    AgentPlanAskQueryInteractiveSchema,
    AgentAskInteractiveSchema,
    WorkflowBuilderPreviewInteractiveSchema
  ]),
  z.object({
    askId: z.string().nullish()
  })
);
export type InteractiveNodeResponseType = z.infer<typeof InteractiveNodeResponseTypeSchema>;

export const WorkflowInteractiveResponseTypeSchema = z.intersection(
  InteractiveBasicTypeSchema,
  InteractiveNodeResponseTypeSchema
);
export type WorkflowInteractiveResponseType = z.infer<typeof WorkflowInteractiveResponseTypeSchema>;
