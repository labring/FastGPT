import { FlowNodeTypeEnum, NodeColorSchemaEnum, NodeGradients } from '../node/constant';
import { FlowNodeInputItemTypeSchema, FlowNodeOutputItemTypeSchema } from './io';
import { HttpToolConfigTypeSchema } from '../../app/tool/httpTool/type';
import { McpToolConfigSchema } from '../../app/tool/mcpTool/type';
import { ParentIdSchema } from '../../../common/parentFolder/type';
import { InteractiveNodeResponseTypeSchema } from '../template/system/interactive/type';
import { StoreSecretValueTypeSchema } from '../../../common/secret/type';
import { PluginStatusSchema } from '../../plugin/type';
import { SourceMemberSchema } from '../../../support/user/type';
import z from 'zod';

export const NodeToolConfigTypeSchema = z.object({
  mcpToolSet: z
    .object({
      toolId: z.string(),
      url: z.string(),
      headerSecret: StoreSecretValueTypeSchema.optional(),
      toolList: z.array(McpToolConfigSchema)
    })
    .optional(),
  mcpTool: z
    .object({
      toolId: z.string()
    })
    .optional(),
  systemTool: z
    .object({
      toolId: z.string()
    })
    .optional(),
  systemToolSet: z
    .object({
      toolId: z.string(),
      toolList: z.array(
        z.object({
          toolId: z.string(),
          name: z.string(),
          description: z.string()
        })
      )
    })
    .optional(),
  httpToolSet: z
    .object({
      toolList: z.array(HttpToolConfigTypeSchema),
      baseUrl: z.string().optional(),
      apiSchemaStr: z.string().optional(),
      customHeaders: z.string().optional(),
      headerSecret: StoreSecretValueTypeSchema.optional()
    })
    .optional(),
  httpTool: z
    .object({
      toolId: z.string()
    })
    .optional()
});
export type NodeToolConfigType = z.infer<typeof NodeToolConfigTypeSchema>;

export const ToolDataSchema = z.object({
  diagram: z.string().optional(),
  userGuide: z.string().optional(),
  courseUrl: z.string().optional(),
  name: z.string().optional(),
  avatar: z.string().optional(),
  error: z.string().optional(),
  status: PluginStatusSchema.optional()
});

export const FlowNodeCommonTypeSchema = z.object({
  parentNodeId: z.string().optional(),
  flowNodeType: z.enum(FlowNodeTypeEnum), // render node card
  abandon: z.boolean().optional(), // abandon node

  avatar: z.string().optional(), // avatar
  avatarLinear: z.string().optional(), // avatar linear
  colorSchema: z.enum(NodeColorSchemaEnum).optional(), // color schema
  name: z.string(), // name
  intro: z.string().optional(), // template list intro
  toolDescription: z.string().optional(), // tool description
  showStatus: z.boolean().optional(), // chatting response step status

  version: z.string().optional(), // version
  versionLabel: z.string().optional(), // Just ui show
  isLatestVersion: z.boolean().optional(), // Just ui show

  // data
  catchError: z.boolean().optional(),
  inputs: z.array(FlowNodeInputItemTypeSchema), // inputs
  outputs: z.array(FlowNodeOutputItemTypeSchema), // outputs

  // plugin data
  pluginId: z.string().optional(), // plugin id
  isFolder: z.boolean().optional(),
  pluginData: ToolDataSchema.optional(),

  // tool data
  toolConfig: NodeToolConfigTypeSchema.optional(),

  // Not store, just computed
  currentCost: z.number().optional(),
  systemKeyCost: z.number().optional(),
  hasTokenFee: z.boolean().optional(),
  hasSystemSecret: z.boolean().optional()
});
export type FlowNodeCommonType = z.infer<typeof FlowNodeCommonTypeSchema>;

const HandleTypeSchema = z.object({
  left: z.boolean(),
  right: z.boolean(),
  top: z.boolean(),
  bottom: z.boolean()
});

// system template
export const FlowNodeTemplateTypeSchema = FlowNodeCommonTypeSchema.extend({
  id: z.string(),
  templateType: z.string(),
  status: PluginStatusSchema.optional(),

  showSourceHandle: z.boolean().optional(),
  showTargetHandle: z.boolean().optional(),

  // Info
  isTool: z.boolean().optional(), // can be connected by tool

  // Action
  forbidDelete: z.boolean().optional(), // forbid delete
  unique: z.boolean().optional(),

  diagram: z.string().optional(),
  courseUrl: z.string().optional(),
  userGuide: z.string().optional(),
  tags: z.array(z.string()).nullish(),

  // @deprecated
  sourceHandle: HandleTypeSchema.optional(),
  targetHandle: HandleTypeSchema.optional()
});
export type FlowNodeTemplateType = z.infer<typeof FlowNodeTemplateTypeSchema>;

// Api response
export const NodeTemplateListItemTypeSchema = z.object({
  id: z.string(), // 系统节点-系统节点的 id， 系统插件-插件的 id，团队应用的 id
  flowNodeType: z.enum(FlowNodeTypeEnum), // render node card
  parentId: ParentIdSchema.optional(),
  isFolder: z.boolean().optional(),
  templateType: z.string().optional(),
  tags: z.array(z.string()).nullish(),
  avatar: z.string().optional(),
  name: z.string(),
  intro: z.string().optional(), // template list intro
  isTool: z.boolean().optional(),

  authorAvatar: z.string().optional(),
  author: z.string().optional(),

  unique: z.boolean().optional(),

  currentCost: z.number().optional(), // 当前积分消耗
  systemKeyCost: z.number().optional(), // 系统密钥费用，统一为数字
  hasTokenFee: z.boolean().optional(),
  instructions: z.string().optional(), // 使用说明
  courseUrl: z.string().optional(),
  sourceMember: SourceMemberSchema.optional(),
  toolSource: z.enum(['uploaded', 'built-in']).optional()
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
  isError: z.boolean().optional(),
  searchedText: z.string().optional(),
  debugResult: z
    .object({
      status: z.enum(['running', 'success', 'skipped', 'failed']),
      message: z.string().optional(),
      showResult: z.boolean().optional(),
      response: z.any().optional(),
      isExpired: z.boolean().optional(),
      interactiveResponse: InteractiveNodeResponseTypeSchema.optional(),
      nodeLogs: z
        .array(
          z.object({
            time: z.string(),
            level: z.enum(['debug', 'info', 'warn', 'error']),
            message: z.string(),
            data: z.record(z.string(), z.any()).optional()
          })
        )
        .optional()
    })
    .optional(),
  isFolded: z.boolean().optional()
});
export type FlowNodeItemType = z.infer<typeof FlowNodeItemSchema>;

// store node type
export const StoreNodeItemTypeSchema = FlowNodeCommonTypeSchema.extend({
  nodeId: z.string(),
  position: z
    .object({
      x: z.number(),
      y: z.number()
    })
    .optional()
});
export type StoreNodeItemType = z.infer<typeof StoreNodeItemTypeSchema>;
