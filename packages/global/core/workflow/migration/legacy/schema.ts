import z from 'zod';
import { BoolSchema, IntSchema } from '../../../../common/zod';
import { AppChatConfigTypeSchema, AppQGConfigTypeSchema } from '../../../app/type';
import { FlowNodeInputTypeEnum, FlowNodeTypeEnum } from '../../node/constant';
import { FlowNodeInputItemTypeSchema } from '../../type/io';
import { StoreEdgeItemTypeSchema } from '../../type/edge';
import { StoreNodeItemTypeSchema } from '../../type/node';

/** Historical chat config is only accepted at the workflow migration boundary. */
const LegacyAppChatConfigSchema = AppChatConfigTypeSchema.omit({ questionGuide: true }).extend({
  // Legacy data accepts a boolean.
  questionGuide: z.union([z.boolean(), AppQGConfigTypeSchema]).optional()
});

/** 历史工作流输入。旧索引只允许在外部数据迁移阶段出现。 */
export const LegacyFlowNodeInputItemSchema = FlowNodeInputItemTypeSchema.omit({
  renderTypeList: true
}).extend({
  renderTypeList: z.array(z.enum(FlowNodeInputTypeEnum)).optional(),
  isToolParam: BoolSchema.optional().meta({
    description: '历史工具输入默认由 Agent 生成标记',
    deprecated: true
  }),
  selectedTypeIndex: IntSchema.optional().meta({
    description: '历史工作流输入类型索引',
    deprecated: true
  })
});
export type LegacyFlowNodeInputItem = z.infer<typeof LegacyFlowNodeInputItemSchema>;

/** 历史工作流节点，输入允许携带 selectedTypeIndex。 */
export const LegacyStoreNodeItemSchema = StoreNodeItemTypeSchema.omit({
  flowNodeType: true,
  inputs: true
}).extend({
  flowNodeType: z.union([
    z.enum(FlowNodeTypeEnum),
    z.literal('userGuide'),
    z.literal('pluginConfig')
  ]),
  inputs: z.array(LegacyFlowNodeInputItemSchema)
});
export type LegacyStoreNodeItem = z.infer<typeof LegacyStoreNodeItemSchema>;

/** 迁移所用的历史工作流数据。 */
export const LegacyWorkflowDataSchema = z.object({
  nodes: z.array(LegacyStoreNodeItemSchema),
  edges: z.array(StoreEdgeItemTypeSchema).default([]),
  chatConfig: LegacyAppChatConfigSchema.optional()
});
export type LegacyWorkflowData = z.infer<typeof LegacyWorkflowDataSchema>;
export type LegacyWorkflowDataInput = {
  nodes: unknown[];
  edges?: unknown;
  chatConfig?: unknown;
};
