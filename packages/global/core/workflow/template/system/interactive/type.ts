import { WorkflowBuilderPreviewInteractiveSchema } from '../../../builder/type';
import { NodeOutputItemSchema } from '../../../runtime/type';
import { FlowNodeInputTypeEnum } from '../../../../../core/workflow/node/constant';
import { WorkflowIOValueTypeEnum } from '../../../../../core/workflow/constants';
import { AppFileSelectConfigTypeSchema } from '../../../../app/type/config.schema';
import { RuntimeEdgeItemTypeSchema } from '../../../type/edge';
import { ReferenceArrayValueTypeSchema } from '../../../type/io';
import z from 'zod';
import { JsonValueOpenApiMeta, OpenObjectOpenApiMeta } from '../../../../../common/zod/openapi';
import { AgentAskInteractiveSchema } from '../../../../ai/agent/type';

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

/** 节点局部交互尚未补齐调度字段，复用完整交互的基础类型并将这些字段设为可选。 */
export type InteractiveNodeType = Partial<
  Pick<
    InteractiveBasicType,
    'entryNodeIds' | 'interactiveId' | 'nodeResponseId' | 'memoryEdges' | 'nodeOutputs'
  >
>;

export const ChildrenInteractiveSchema = z.object({
  type: z.literal('childrenInteractive'),
  params: z.object({
    // 递归结构（WorkflowInteractiveResponseType），运行时保持宽松。
    childrenResponse: z.any().meta({
      ...OpenObjectOpenApiMeta,
      description: '子工作流交互响应'
    })
  })
});
export const ToolCallChildrenInteractiveSchema = z.object({
  type: z.literal('toolChildrenInteractive'),
  params: z.preprocess(
    (value) => {
      // 旧包装只在读取边界提取 ID；快照和 toolParams 不进入新结构。
      if (
        typeof value === 'object' &&
        value !== null &&
        !('toolCallId' in value) &&
        'toolParams' in value &&
        typeof value.toolParams === 'object' &&
        value.toolParams !== null &&
        'toolCallId' in value.toolParams
      ) {
        return { ...value, toolCallId: value.toolParams.toolCallId };
      }
      return value;
    },
    z.object({
      toolCallId: z.string().min(1).meta({
        description: '父模型的原始工具调用 ID，子流程续跑结果回填到此调用'
      }),
      childrenResponse: z.any().meta({
        ...OpenObjectOpenApiMeta,
        description: '子工作流交互响应'
      })
    })
  )
});
// Loop bode
export const LoopInteractiveSchema = z.object({
  type: z.literal('loopInteractive'),
  params: z.object({
    loopResult: z.array(z.any()).meta({ items: JsonValueOpenApiMeta, description: '各轮响应' }),
    childrenResponse: z.any().meta({
      ...OpenObjectOpenApiMeta,
      description: '子工作流交互响应'
    }),
    currentIndex: z.number()
  })
});
export const LoopRunInteractiveSchema = z.object({
  type: z.literal('loopRunInteractive'),
  params: z.object({
    loopHistory: z.array(z.any()).meta({ items: OpenObjectOpenApiMeta, description: '各轮快照' }),
    childrenResponse: z.any().meta({
      ...OpenObjectOpenApiMeta,
      description: '子工作流交互响应'
    }),
    iteration: z.number(),
    pendingIterationSummary: z
      .any()
      .optional()
      .meta({
        ...OpenObjectOpenApiMeta,
        description: '待执行轮次的摘要'
      })
  })
});
export const AgentPlanAskOptionSchema = z.string().min(1);

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

export type LoopRunInteractive = z.infer<typeof LoopRunInteractiveSchema>;

// User selector
export const UserSelectOptionItemSchema = z.object({
  key: z.string(),
  value: z.string()
});
export type UserSelectOptionItemType = z.infer<typeof UserSelectOptionItemSchema>;
export const UserSelectInteractiveSchema = z.object({
  type: z.literal('userSelect'),
  params: z.object({
    // 空说明在 Mongo Mixed 更新后可能从 undefined 变为 null，读取旧快照时统一为空串。
    description: z.preprocess((value) => value ?? '', z.string()),
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
  value: z.any().meta({ ...JsonValueOpenApiMeta, description: '当前填写值' }),
  valueType: z.enum(WorkflowIOValueTypeEnum),
  description: z.string().optional(),
  defaultValue: z
    .any()
    .optional()
    .meta({ ...JsonValueOpenApiMeta, description: '默认值' }),
  required: z.boolean(),

  maxLength: z.number().optional(), // input & textarea
  minLength: z.number().optional(), // password
  max: z.number().optional(), // numberInput
  min: z.number().optional(), // numberInput
  list: z.array(z.object({ label: z.string(), value: z.string() })).optional(), // select
  listInputType: z
    .enum([FlowNodeInputTypeEnum.input, FlowNodeInputTypeEnum.reference])
    .optional()
    .meta({
      description: '选项配置方式（input 手动输入 / reference 变量引用）'
    }),
  listReference: ReferenceArrayValueTypeSchema.optional().meta({
    description: '动态选项引用变量列表'
  }),

  canLocalUpload: z.boolean().optional(),
  canUrlUpload: z.boolean().optional()
});
export type UserInputFormItemType = z.infer<typeof UserInputFormItemSchema>;
export const UserInputInteractiveSchema = z.object({
  type: z.literal('userInput'),
  params: z.object({
    // 与用户选择保持一致，兼容持久化快照中的空说明。
    description: z.preprocess((value) => value ?? '', z.string()),
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

export const InteractiveNodeResponseTypeSchema = z.discriminatedUnion('type', [
  UserSelectInteractiveSchema,
  UserInputInteractiveSchema,
  ChildrenInteractiveSchema,
  ToolCallChildrenInteractiveSchema,
  LoopInteractiveSchema,
  LoopRunInteractiveSchema,
  PaymentPauseInteractiveSchema,
  AgentAskInteractiveSchema,
  WorkflowBuilderPreviewInteractiveSchema
]);
export type InteractiveNodeResponseType = z.infer<typeof InteractiveNodeResponseTypeSchema>;

export const WorkflowInteractiveResponseTypeSchema = z.intersection(
  InteractiveBasicTypeSchema,
  InteractiveNodeResponseTypeSchema
);
export type WorkflowInteractiveResponseType = z.infer<typeof WorkflowInteractiveResponseTypeSchema>;
