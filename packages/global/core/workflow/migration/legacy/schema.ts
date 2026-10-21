import z from 'zod';
import { BoolSchema, IntSchema } from '../../../../common/zod';
import { AppChatConfigTypeSchema, AppQGConfigTypeSchema } from '../../../app/type';
import { ToolSetToolSummarySchema } from '../../../app/tool/toolSet/type';
import { FlowNodeInputTypeEnum, FlowNodeTypeEnum } from '../../node/constant';
import { FlowNodeInputItemTypeSchema } from '../../type/io';
import { StoreEdgeItemTypeSchema } from '../../type/edge';
import {
  HttpToolSetRuntimeConfigSchema,
  McpToolSetRuntimeConfigSchema,
  StoreNodeItemTypeSchema,
  ToolSetPreviewReferenceSchema
} from '../../type/node';

const LegacyToolSetPreviewReferenceSchema = ToolSetPreviewReferenceSchema.extend({
  toolList: z.array(ToolSetToolSummarySchema.strict()).optional()
}).strict();

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const CurrentInlineToolSetSchemas = {
  mcpToolSet: McpToolSetRuntimeConfigSchema.strict(),
  httpToolSet: HttpToolSetRuntimeConfigSchema.strict()
};

/** 旧快照只在迁移边界读取，并按 pluginId 归一为当前内联配置或外部引用。 */
const normalizeLegacyToolSetNode = (value: unknown) => {
  if (!isRecord(value)) return value;
  if (value.flowNodeType !== FlowNodeTypeEnum.toolSet) return value;
  if (!isRecord(value.toolConfig)) return value;

  const toolConfig = { ...value.toolConfig };
  (['mcpToolSet', 'httpToolSet'] as const).forEach((key) => {
    const toolSet = toolConfig[key];
    if (!isRecord(toolSet)) return;

    if (value.pluginId) {
      const nestedToolId =
        typeof toolSet.toolId === 'string' && toolSet.toolId ? toolSet.toolId : undefined;
      // pluginId 决定引用模式；嵌套 ID 是规范资源 ID，旧快照缺失时才从父节点补齐。
      const toolId =
        nestedToolId ?? (typeof value.pluginId === 'string' ? value.pluginId : undefined);
      const toolList = Array.isArray(toolSet.toolList)
        ? toolSet.toolList.flatMap((tool) =>
            isRecord(tool) && typeof tool.name === 'string' && typeof tool.description === 'string'
              ? [{ name: tool.name, description: tool.description }]
              : []
          )
        : undefined;
      toolConfig[key] = LegacyToolSetPreviewReferenceSchema.parse({
        ...(toolId ? { toolId } : {}),
        ...(toolList ? { toolList } : {})
      });
      return;
    }

    const inlineConfig = CurrentInlineToolSetSchemas[key].safeParse(toolSet);
    if (inlineConfig.success) toolConfig[key] = inlineConfig.data;
  });

  return { ...value, toolConfig };
};

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
const LegacyStoreNodeItemBaseSchema = StoreNodeItemTypeSchema.omit({
  flowNodeType: true,
  inputs: true
}).safeExtend({
  flowNodeType: z.union([
    z.enum(FlowNodeTypeEnum),
    z.literal('userGuide'),
    z.literal('pluginConfig')
  ]),
  inputs: z.array(LegacyFlowNodeInputItemSchema)
});

export const LegacyStoreNodeItemSchema = z
  .unknown()
  .superRefine((value, ctx) => {
    if (
      !isRecord(value) ||
      value.flowNodeType !== FlowNodeTypeEnum.toolSet ||
      !isRecord(value.toolConfig)
    ) {
      return;
    }

    if (value.toolConfig.mcpToolSet && value.toolConfig.httpToolSet) {
      ctx.addIssue({
        code: 'custom',
        path: ['toolConfig', 'httpToolSet'],
        message: '工具集节点只能配置 MCP 或 HTTP 工具集'
      });
      return;
    }
    if (value.pluginId) return;

    (['mcpToolSet', 'httpToolSet'] as const).forEach((key) => {
      const toolSet = value.toolConfig[key];
      if (!isRecord(toolSet) || CurrentInlineToolSetSchemas[key].safeParse(toolSet).success) return;
      ctx.addIssue({
        code: 'custom',
        path: ['toolConfig', key],
        message: '节点内工具集必须符合当前完整配置'
      });
    });
  })
  .transform(normalizeLegacyToolSetNode)
  .pipe(LegacyStoreNodeItemBaseSchema);
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
