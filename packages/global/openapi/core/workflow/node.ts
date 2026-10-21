import z from 'zod';
import {
  FlowNodeInputItemTypeSchema,
  FlowNodeOutputItemTypeSchema
} from '../../../core/workflow/type/io';
import { FlowNodeTypeEnum } from '../../../core/workflow/node/constant';
import {
  HttpToolRuntimeConfigSchema,
  HttpToolSetRuntimeConfigSchema,
  McpToolRuntimeConfigSchema,
  McpToolSetRuntimeConfigSchema,
  NodeToolConfigTypeSchema,
  StoreNodeItemTypeSchema,
  ToolDataSchema,
  ToolSetPreviewReferenceSchema
} from '../../../core/workflow/type/node';
import { HttpToolConfigTypeSchema } from '../../../core/app/tool/httpTool/type';
import { McpToolConfigSchema } from '../../../core/app/tool/mcpTool/type';
import { BoolSchema, NumSchema } from '../../../common/zod';

export const OpenAPIFlowNodeInputItemTypeSchema = FlowNodeInputItemTypeSchema.omit({
  list: true,
  enums: true
})
  .extend({
    // 运行时 schema 会通过 transform 为旧版选项补齐 label；OpenAPI 响应 schema 不能包含 transform。
    list: z
      .array(
        z.object({
          label: z.string().meta({
            description: '变量选项展示名称'
          }),
          value: z.string().meta({
            description: '变量选项实际值'
          }),
          icon: z.string().optional().meta({
            description: '变量选项图标'
          }),
          description: z.string().optional().meta({
            description: '变量选项说明'
          })
        })
      )
      .optional()
      .meta({
        description: '选择类变量的可选项'
      }),
    enums: z
      .array(
        z.object({
          value: z.string().meta({
            description: '枚举项实际值'
          }),
          label: z.string().meta({
            description: '枚举项展示名称'
          })
        })
      )
      .optional()
      .meta({
        description: '已废弃：旧版枚举变量选项',
        deprecated: true
      })
  })
  .meta({
    description: '工作流节点输入配置'
  });

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

// `invalidCondition` in FlowNodeOutputItemTypeSchema is a Zod function schema used only
// by the editor to validate outputs; function schemas cannot be represented in JSON
// Schema, so we strip it before exposing via OpenAPI.
export const OpenAPIFlowNodeOutputItemTypeSchema = FlowNodeOutputItemTypeSchema.omit({
  invalidCondition: true
}).meta({
  description: '工作流节点输出配置'
});

const OpenAPIToolDataSchema = ToolDataSchema.meta({
  description: '节点关联工具展示信息'
});

const OpenAPIToolRefSchema = z
  .object({
    toolId: z.string().meta({
      description: '节点引用的工具 ID'
    }),
    source: z.string().optional().meta({
      description: '节点引用的工具来源。调试工具会写入 debug source'
    })
  })
  .meta({
    description: '节点引用的工具配置'
  });

const OpenAPINodeToolConfigTypeSchema = NodeToolConfigTypeSchema.extend({
  mcpTool: z.union([OpenAPIToolRefSchema, McpToolRuntimeConfigSchema]).optional().meta({
    description: '节点绑定的 MCP 单工具引用或运行时内联配置'
  }),
  systemTool: OpenAPIToolRefSchema.optional().meta({
    description: '节点绑定的系统单工具配置'
  }),
  httpTool: z.union([OpenAPIToolRefSchema, HttpToolRuntimeConfigSchema]).optional().meta({
    description: '节点绑定的 HTTP 单工具引用或运行时内联配置'
  })
}).meta({
  description: '节点工具配置'
});

export const OpenAPIStoreNodeItemTypeSchema = StoreNodeItemTypeSchema.omit({
  inputs: true,
  outputs: true,
  pluginData: true,
  toolConfig: true,
  position: true
})
  .safeExtend({
    parentNodeId: z.string().optional().meta({
      description: '父节点 ID，用于循环、分组等嵌套节点场景'
    }),
    flowNodeType: StoreNodeItemTypeSchema.shape.flowNodeType.meta({
      description: '工作流节点类型'
    }),
    abandon: BoolSchema.optional().meta({
      description: '节点是否被废弃或隐藏'
    }),
    avatar: z.string().optional().meta({
      description: '节点头像'
    }),
    avatarLinear: z.string().optional().meta({
      description: '节点头像渐变色配置'
    }),
    colorSchema: StoreNodeItemTypeSchema.shape.colorSchema.meta({
      description: '节点在编辑器中的配色方案'
    }),
    name: z.string().meta({
      description: '节点名称'
    }),
    intro: z.string().optional().meta({
      description: '节点简介'
    }),
    showStatus: BoolSchema.optional().meta({
      description: '对话运行时是否展示该节点执行状态'
    }),
    version: z.string().optional().meta({
      description: '节点实现版本'
    }),
    versionLabel: z.string().optional().meta({
      description: '节点版本展示名称'
    }),
    isLatestVersion: BoolSchema.optional().meta({
      description: '该节点是否为当前最新版本'
    }),
    catchError: BoolSchema.optional().meta({
      description: '节点执行异常时是否进入错误捕获流程'
    }),
    inputs: z.array(OpenAPIFlowNodeInputItemTypeSchema).meta({
      description: '节点输入配置列表'
    }),
    outputs: z.array(OpenAPIFlowNodeOutputItemTypeSchema).meta({
      description: '节点输出配置列表'
    }),
    pluginId: z.string().optional().meta({
      description: '节点关联的插件 ID'
    }),
    isFolder: BoolSchema.optional().meta({
      description: '该节点是否为文件夹节点'
    }),
    pluginData: OpenAPIToolDataSchema.optional().meta({
      description: '节点关联插件或工具的展示信息'
    }),
    toolConfig: OpenAPINodeToolConfigTypeSchema.optional().meta({
      description: '节点绑定的工具配置'
    }),
    currentCost: NumSchema.optional().meta({
      description: '节点当前预估积分消耗'
    }),
    systemKeyCost: NumSchema.optional().meta({
      description: '节点使用系统密钥产生的额外积分费用'
    }),
    hasTokenFee: BoolSchema.optional().meta({
      description: '节点运行是否会产生模型 token 费用'
    }),
    hasSystemSecret: BoolSchema.optional().meta({
      description: '节点是否使用系统级密钥'
    }),
    nodeId: z.string().meta({
      description: '工作流节点 ID'
    }),
    position: z
      .object({
        x: NumSchema.meta({
          description: '节点在画布中的横坐标'
        }),
        y: NumSchema.meta({
          description: '节点在画布中的纵坐标'
        })
      })
      .optional()
      .meta({
        description: '节点在工作流画布中的位置'
      })
  })
  .meta({
    description: '应用工作流节点配置'
  });

// 节点内工具集保存完整子工具配置；外部工具集只保留引用及展示摘要。
const PersistedMcpToolSetRuntimeConfigSchema = McpToolSetRuntimeConfigSchema.extend({
  toolList: z.array(McpToolConfigSchema.strict())
}).strict();
const PersistedHttpToolSetRuntimeConfigSchema = HttpToolSetRuntimeConfigSchema.extend({
  toolList: z.array(HttpToolConfigTypeSchema.strict())
}).strict();

const OpenAPIPersistedNodeToolConfigTypeSchema = OpenAPINodeToolConfigTypeSchema.extend({
  mcpTool: OpenAPIToolRefSchema.strict().optional().meta({
    description: '节点引用的 MCP 单工具配置'
  }),
  httpTool: OpenAPIToolRefSchema.strict().optional().meta({
    description: '节点引用的 HTTP 单工具配置'
  }),
  mcpToolSet: z
    .union([ToolSetPreviewReferenceSchema, PersistedMcpToolSetRuntimeConfigSchema])
    .optional()
    .meta({
      description: '节点引用的 MCP 工具集或节点内运行时配置'
    }),
  httpToolSet: z
    .union([ToolSetPreviewReferenceSchema, PersistedHttpToolSetRuntimeConfigSchema])
    .optional()
    .meta({
      description: '节点引用的 HTTP 工具集或节点内运行时配置'
    })
});

const PersistedOpenAPIStoreNodeItemTypeBaseSchema = OpenAPIStoreNodeItemTypeSchema.omit({
  toolConfig: true
}).safeExtend({
  inputs: z.array(OpenAPIFlowNodeInputItemTypeSchema).meta({
    description: '持久化节点输入配置列表'
  }),
  toolConfig: OpenAPIPersistedNodeToolConfigTypeSchema.optional().meta({
    description: '持久化节点工具配置'
  })
});

const validatePersistedToolSetReference = ({
  node,
  ctx
}: {
  node: { flowNodeType?: string; pluginId?: string; toolConfig?: unknown };
  ctx: z.RefinementCtx;
}) => {
  const { pluginId } = node;
  const toolConfig = isRecord(node.toolConfig) ? node.toolConfig : undefined;
  if (
    node.flowNodeType === FlowNodeTypeEnum.toolSet &&
    toolConfig?.mcpToolSet &&
    toolConfig.httpToolSet
  ) {
    ctx.addIssue({
      code: 'custom',
      path: ['toolConfig', 'httpToolSet'],
      message: '工具集节点只能配置 MCP 或 HTTP 工具集'
    });
  }

  (['mcpToolSet', 'httpToolSet'] as const).forEach((key) => {
    const toolSet = toolConfig?.[key];
    if (!toolSet) return;

    const reference = ToolSetPreviewReferenceSchema.safeParse(toolSet);
    const isInlineConfig =
      key === 'mcpToolSet'
        ? PersistedMcpToolSetRuntimeConfigSchema.safeParse(toolSet).success
        : PersistedHttpToolSetRuntimeConfigSchema.safeParse(toolSet).success;
    const isValid = pluginId ? reference.success : isInlineConfig;

    if (!isValid) {
      ctx.addIssue({
        code: 'custom',
        path: ['toolConfig', key],
        message: pluginId ? '外部工具集节点必须使用工具集引用配置' : '节点内工具集必须使用完整配置'
      });
    }
  });
};

export const PersistedOpenAPIStoreNodeItemTypeSchema =
  PersistedOpenAPIStoreNodeItemTypeBaseSchema.superRefine((node, ctx) =>
    validatePersistedToolSetReference({ node, ctx })
  ).meta({ description: '持久化应用工作流节点配置' });

export type PersistedOpenAPIStoreNodeItemType = z.infer<
  typeof PersistedOpenAPIStoreNodeItemTypeSchema
>;
