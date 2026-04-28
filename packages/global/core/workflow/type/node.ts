import { FlowNodeTypeEnum, NodeColorSchemaEnum } from '../node/constant';
import { FlowNodeInputItemTypeSchema, FlowNodeOutputItemTypeSchema } from './io';
import { HttpToolConfigTypeSchema } from '../../app/tool/httpTool/type';
import { McpToolConfigSchema } from '../../app/tool/mcpTool/type';
import { ParentIdSchema } from '../../../common/parentFolder/type';
import { InteractiveNodeResponseTypeSchema } from '../template/system/interactive/type';
import { StoreSecretValueTypeSchema } from '../../../common/secret/type';
import { PluginStatusSchema } from '../../plugin/type';
import { SourceMemberSchema } from '../../../support/user/type';
import z from 'zod';
import { BoolSchema, NumSchema } from '../../../common/zod';

export const NodeToolConfigTypeSchema = z.object({
  mcpToolSet: z
    .object({
      url: z.string().meta({
        description: 'MCP 服务地址'
      }),
      headerSecret: StoreSecretValueTypeSchema.nullish().meta({
        description: 'MCP 服务请求头密钥配置'
      }),
      toolList: z.array(McpToolConfigSchema).meta({
        description: 'MCP 工具集包含的工具列表'
      })
    })
    .optional()
    .meta({
      description: '节点绑定的 MCP 工具集配置'
    }),
  mcpTool: z
    .object({
      toolId: z.string().meta({
        description: '节点引用的 MCP 工具 ID'
      }) // mcp-appId/oolname
    })
    .optional()
    .meta({
      description: '节点绑定的 MCP 单工具配置'
    }),
  systemTool: z
    .object({
      toolId: z.string().meta({
        description: '节点引用的系统工具 ID'
      })
    })
    .optional()
    .meta({
      description: '节点绑定的系统单工具配置'
    }),
  systemToolSet: z
    .object({
      toolId: z.string().meta({
        description: '系统工具集 ID'
      }),
      toolList: z
        .array(
          z
            .object({
              toolId: z.string().meta({
                description: '系统工具 ID'
              }),
              name: z.string().meta({
                description: '系统工具名称'
              }),
              description: z.string().meta({
                description: '系统工具能力说明'
              })
            })
            .meta({
              description: '系统工具配置项'
            })
        )
        .meta({
          description: '系统工具集包含的工具列表'
        })
    })
    .optional()
    .meta({
      description: '节点绑定的系统工具集配置'
    }),
  httpToolSet: z
    .object({
      toolList: z.array(HttpToolConfigTypeSchema).meta({
        description: 'HTTP 工具集包含的工具列表'
      }),
      baseUrl: z.string().optional().meta({
        description: 'HTTP 工具集请求基础地址'
      }),
      apiSchemaStr: z.string().optional().meta({
        description: 'HTTP 工具集导入的 OpenAPI Schema 原始内容'
      }),
      customHeaders: z.string().optional().meta({
        description: 'HTTP 工具集公共请求头 JSON 字符串'
      }),
      headerSecret: StoreSecretValueTypeSchema.nullish().meta({
        description: 'HTTP 工具集请求头密钥配置'
      })
    })
    .optional()
    .meta({
      description: '节点绑定的 HTTP 工具集配置'
    }),
  httpTool: z
    .object({
      toolId: z.string().meta({
        description: '节点引用的 HTTP 工具 ID'
      }) // http-appId/oolname
    })
    .optional()
    .meta({
      description: '节点绑定的 HTTP 单工具配置'
    })
});
export type NodeToolConfigType = z.infer<typeof NodeToolConfigTypeSchema>;

export const ToolDataSchema = z.object({
  diagram: z.string().optional().meta({
    description: '工具说明图地址'
  }),
  userGuide: z.string().optional().meta({
    description: '工具使用指引'
  }),
  courseUrl: z.string().optional().meta({
    description: '工具教程地址'
  }),
  name: z.string().optional().meta({
    description: '工具展示名称'
  }),
  avatar: z.string().optional().meta({
    description: '工具头像'
  }),
  error: z.string().optional().meta({
    description: '工具配置错误说明'
  }),
  status: PluginStatusSchema.optional().meta({
    description: '工具当前状态'
  })
});

export const FlowNodeCommonTypeSchema = z.object({
  parentNodeId: z.string().optional(),
  flowNodeType: z.enum(FlowNodeTypeEnum), // render node card
  abandon: BoolSchema.optional(), // abandon node

  avatar: z.string().optional(), // avatar
  avatarLinear: z.string().optional(), // avatar linear
  colorSchema: z.enum(NodeColorSchemaEnum).optional(), // color schema
  name: z.string(), // name
  intro: z.string().optional(), // template list intro
  toolDescription: z.string().optional(), // tool description
  showStatus: BoolSchema.optional(), // chatting response step status

  version: z.string().optional(), // version
  versionLabel: z.string().optional(), // Just ui show
  isLatestVersion: BoolSchema.optional(), // Just ui show

  // data
  catchError: BoolSchema.optional(),
  inputs: z.array(FlowNodeInputItemTypeSchema), // inputs
  outputs: z.array(FlowNodeOutputItemTypeSchema), // outputs

  // plugin data
  pluginId: z.string().optional(), // plugin id
  isFolder: BoolSchema.optional(),
  pluginData: ToolDataSchema.optional(),

  // tool data
  toolConfig: NodeToolConfigTypeSchema.optional(),

  // Not store, just computed
  currentCost: NumSchema.optional(),
  systemKeyCost: NumSchema.optional(),
  hasTokenFee: BoolSchema.optional(),
  hasSystemSecret: BoolSchema.optional()
});
export type FlowNodeCommonType = z.infer<typeof FlowNodeCommonTypeSchema>;

const HandleTypeSchema = z.object({
  left: BoolSchema,
  right: BoolSchema,
  top: BoolSchema,
  bottom: BoolSchema
});

// system template
export const FlowNodeTemplateTypeSchema = FlowNodeCommonTypeSchema.extend({
  id: z.string(),
  status: PluginStatusSchema.optional(),

  showSourceHandle: BoolSchema.optional(),
  showTargetHandle: BoolSchema.optional(),

  // Info
  isTool: BoolSchema.optional(), // can be connected by tool

  // Action
  forbidDelete: BoolSchema.optional(), // forbid delete
  unique: BoolSchema.optional(),

  diagram: z.string().optional(),
  courseUrl: z.string().optional(),
  userGuide: z.string().optional(),
  tags: z.array(z.string()).nullish(),

  /** @deprecated */
  sourceHandle: HandleTypeSchema.optional(),
  /** @deprecated */
  targetHandle: HandleTypeSchema.optional(),
  /** @deprecated */
  templateType: z.string().optional()
});
export type FlowNodeTemplateType = z.infer<typeof FlowNodeTemplateTypeSchema>;

// Api response
export const NodeTemplateListItemTypeSchema = z.object({
  id: z.string(), // 系统节点-系统节点的 id， 系统插件-插件的 id，团队应用的 id
  flowNodeType: z.enum(FlowNodeTypeEnum), // render node card
  parentId: ParentIdSchema.optional(),
  isFolder: BoolSchema.optional(),
  templateType: z.string().optional(),
  tags: z.array(z.string()).nullish(),
  avatar: z.string().optional(),
  name: z.string(),
  intro: z.string().optional(), // template list intro
  isTool: BoolSchema.optional(),

  authorAvatar: z.string().optional(),
  author: z.string().optional(),

  unique: BoolSchema.optional(),

  currentCost: NumSchema.optional(), // 当前积分消耗
  systemKeyCost: NumSchema.optional(), // 系统密钥费用，统一为数字
  hasTokenFee: BoolSchema.optional(),
  instructions: z.string().optional(), // 使用说明
  courseUrl: z.string().optional(),
  readmeUrl: z.string().optional(),

  sourceMember: SourceMemberSchema.optional()
  // toolSource: z.enum(['uploaded', 'built-in']).optional()
});

export type NodeTemplateListItemType = z.infer<typeof NodeTemplateListItemTypeSchema>;
export const NodeTemplateListTypeSchema = z.array(
  z.object({
    type: z.string(),
    label: z.string(),
    list: z.array(NodeTemplateListItemTypeSchema)
  })
);
export type NodeTemplateListType = z.infer<typeof NodeTemplateListTypeSchema>;

// react flow node type
export const FlowNodeItemSchema = FlowNodeTemplateTypeSchema.extend({
  nodeId: z.string(),
  parentNodeId: z.string().optional(),
  isError: BoolSchema.optional(),
  searchedText: z.string().optional(),
  debugResult: z
    .object({
      status: z.enum(['running', 'success', 'skipped', 'failed']),
      message: z.string().optional(),
      showResult: BoolSchema.optional(),
      response: z.any().optional(),
      isExpired: BoolSchema.optional(),
      interactiveResponse: InteractiveNodeResponseTypeSchema.optional()
    })
    .optional(),
  isFolded: BoolSchema.optional()
});
export type FlowNodeItemType = z.infer<typeof FlowNodeItemSchema>;

// store node type
export const StoreNodeItemTypeSchema = FlowNodeCommonTypeSchema.extend({
  nodeId: z.string(),
  position: z
    .object({
      x: NumSchema,
      y: NumSchema
    })
    .optional()
});
export type StoreNodeItemType = z.infer<typeof StoreNodeItemTypeSchema>;
