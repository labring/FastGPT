import z from 'zod';
import { PluginStatusSchema } from '../../../../plugin/type';
import { UserTagsSchema } from '../../../../../support/user/type';
import { PluginPermissionEnumSchema } from '../../../../../sdk/fastgpt-plugin';
import { SystemToolSystemSecretStatusEnum } from '../constants';
import { JSONSchemaInputTypeSchema, JSONSchemaOutputTypeSchema } from '../../../jsonschema';

// 系统工具最基础最通用的类型
export const SystemToolBaseSchema = z.object({
  id: z.string(),
  version: z.string(),
  versionLabel: z.string().optional(),
  etag: z.string().optional()
});

export const SystemToolRuntimeSchema = z
  .object({
    minPods: z.number().int().nonnegative(),
    maxPods: z.number().int().positive(),
    podTimeout: z.number().int().positive(),
    maxConcurrentRequestsPerPod: z.number().int().positive()
  })
  .strict()
  .refine((config) => config.minPods <= config.maxPods, {
    message: 'minPods cannot be greater than maxPods',
    path: ['minPods']
  });

export type SystemToolRuntimeConfigType = z.infer<typeof SystemToolRuntimeSchema>;

export const SystemToolListItemSchema = z.object({
  ...SystemToolBaseSchema.shape,
  // 基础信息
  status: PluginStatusSchema.meta({ description: '工具的状态' }),
  source: z.string().meta({ description: '工具的来源, system 或 teamId' }),
  isToolSet: z.boolean().meta({ description: '是否为工具集' }),
  avatar: z.string().meta({ description: '工具的图标' }),
  name: z.string().meta({ description: '工具的名称' }),
  intro: z.string().meta({ description: '工具的简介' }),
  author: z.string().meta({ description: '工具的作者' }),
  tags: z.array(z.string()).meta({ description: '工具的标签' }),
  toolDescription: z.string().meta({ description: '给工具调用使用的工具的描述' }),

  userGuide: z.string().nullish().meta({ description: '工具的使用指南(markdown 纯文本)' }),
  readmeUrl: z.string().optional().meta({ description: '工具的 README 地址' }),
  courseUrl: z.string().optional().meta({ description: '工具的教程地址' }),

  pluginOrder: z.number().optional().meta({ description: '工具的排序字段' }),
  // 计费相关
  originCost: z.number().optional().meta({ description: '工具的原始费用' }), // 现在没用
  currentCost: z.number().meta({ description: '当前使用的费用' }),
  systemKeyCost: z.number().meta({ description: '系统密钥的费用' }),
  hasTokenFee: z.boolean().meta({ description: '是否有系统密钥费用' }),

  hasSystemSecret: z.boolean().meta({ description: '是否有系统密钥' }),
  systemSecretStatus: z
    .enum(SystemToolSystemSecretStatusEnum)
    .default(SystemToolSystemSecretStatusEnum.none)
    .meta({ description: '系统密钥配置状态' }),

  // 用户筛选
  hideTags: z.array(UserTagsSchema).optional(),
  promoteTags: z.array(UserTagsSchema).optional()
});

export type SystemToolListItemType = z.infer<typeof SystemToolListItemSchema>;

export const SystemToolChildDetailSchema = z.object({
  id: z.string(),
  name: z.string(),
  status: PluginStatusSchema.meta({ description: '工具的状态' }),
  description: z.string().optional(),
  toolDescription: z.string().optional(),
  icon: z.string().optional(),
  currentCost: z.number().meta({ description: '当前使用的费用' }),
  systemKeyCost: z.number().meta({ description: '系统密钥的费用' }),
  inputSchema: JSONSchemaInputTypeSchema.optional(),
  outputSchema: JSONSchemaOutputTypeSchema.optional()
});

export type SystemToolChildDetailType = z.infer<typeof SystemToolChildDetailSchema>;

/** 系统工具的详细信息。Repo 只返回 JSON Schema，节点 IO 由 presenter/runtime 按需转换。 */
export const SystemToolDetailSchema = z.object({
  ...SystemToolListItemSchema.shape,
  children: z.array(SystemToolChildDetailSchema).optional(),

  inputSchema: JSONSchemaInputTypeSchema.optional(),
  outputSchema: JSONSchemaOutputTypeSchema.optional(),
  secretSchema: JSONSchemaInputTypeSchema.optional(),
  secretsVal: z.record(z.string(), z.any()).nullish(),
  isLatestVersion: z.boolean().optional(),
  associatedPluginId: z.string().optional(),
  permissions: z.array(PluginPermissionEnumSchema).optional()
});

export type SystemToolDetailType = z.infer<typeof SystemToolDetailSchema>;

export const SystemToolVersionSchema = z.object({
  version: z.string().meta({
    example: '68ad85a7463006c963799a05',
    description: '工具版本标识。工作流工具为关联应用版本 ID，普通插件工具为插件版本号'
  }),
  versionDescription: z.string().optional().meta({
    example: 'Workflow v1',
    description: '工具版本展示名。工作流工具为关联应用版本名称'
  })
});

export type SystemToolVersionType = z.infer<typeof SystemToolVersionSchema>;
