import z from 'zod';
import {
  FlowNodeInputItemTypeSchema,
  FlowNodeOutputItemTypeSchema
} from '../../../core/workflow/type/io';
import {
  NodeToolConfigTypeSchema,
  StoreNodeItemTypeSchema,
  ToolDataSchema
} from '../../../core/workflow/type/node';
import { BoolSchema, NumSchema } from '../../../common/zod';

const OpenAPIFlowNodeInputItemTypeSchema = FlowNodeInputItemTypeSchema.meta({
  description: '工作流节点输入配置'
});

// `invalidCondition` in FlowNodeOutputItemTypeSchema is a Zod function schema used only
// by the editor to validate outputs; function schemas cannot be represented in JSON
// Schema, so we strip it before exposing via OpenAPI.
const OpenAPIFlowNodeOutputItemTypeSchema = FlowNodeOutputItemTypeSchema.omit({
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
    })
  })
  .meta({
    description: '节点引用的工具配置'
  });

const OpenAPINodeToolConfigTypeSchema = NodeToolConfigTypeSchema.extend({
  mcpTool: OpenAPIToolRefSchema.optional().meta({
    description: '节点绑定的 MCP 单工具配置'
  }),
  systemTool: OpenAPIToolRefSchema.optional().meta({
    description: '节点绑定的系统单工具配置'
  }),
  httpTool: OpenAPIToolRefSchema.optional().meta({
    description: '节点绑定的 HTTP 单工具配置'
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
  .extend({
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
    toolDescription: z.string().optional().meta({
      description: '节点作为工具被调用时的能力说明'
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
