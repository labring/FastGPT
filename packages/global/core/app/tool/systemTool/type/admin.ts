// admin 系统管理员视角看到的系统工具的类型

import z from 'zod';
import { SystemToolBaseSchema, SystemToolDetailSchema } from './base';
import { PluginStatusSchema } from '../../../../plugin/type';
import { SystemToolSystemSecretStatusEnum } from '../constants';

export const AdminSystemToolListItemSchema = z.object({
  ...SystemToolBaseSchema.shape,
  // 基础信息
  status: PluginStatusSchema.meta({ description: '工具的状态' }),
  // source: z.string().meta({ description: '工具的来源, system 或 teamId' }),
  isToolSet: z.boolean().meta({ description: '是否为工具集' }),
  avatar: z.string().meta({ description: '工具的图标' }),
  name: z.string().meta({ description: '工具的名称' }),
  intro: z.string().meta({ description: '工具的简介' }),
  author: z.string().meta({ description: '工具的作者' }),
  tags: z.array(z.string()).meta({ description: '工具的标签' }),
  pluginOrder: z.number().optional().meta({ description: '工具的排序字段' }),
  originCost: z.number().optional().meta({ description: '工具的原始费用' }),
  currentCost: z.number().meta({ description: '当前使用的费用' }),
  systemKeyCost: z.number().meta({ description: '系统密钥的费用' }),
  hasTokenFee: z.boolean().meta({ description: '是否有系统密钥费用' }),
  systemSecretStatus: z
    .enum(SystemToolSystemSecretStatusEnum)
    .meta({ description: '系统密钥配置状态' })
});

export type AdminSystemToolListItemType = z.infer<typeof AdminSystemToolListItemSchema>;

export const AdminSystemToolChildDetailSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  icon: z.string().optional(),
  currentCost: z.number().meta({ description: '当前使用的费用' }),
  systemKeyCost: z.number().meta({ description: '系统密钥的费用' })
  // inputs: z.array(FlowNodeInputItemTypeSchema),
  // outputs: z.array(FlowNodeOutputItemTypeSchema)
});

export type AdminSystemToolChildDetailType = z.infer<typeof AdminSystemToolChildDetailSchema>;

/** 系统工具的详细信息 */
export const AdminSystemToolDetailSchema = z.object({
  ...SystemToolDetailSchema.omit({
    inputs: true,
    outputs: true,
    isLatestVersion: true,
    children: true
  }).shape,
  children: z.array(AdminSystemToolChildDetailSchema).optional()
});

export type AdminSystemToolDetailType = z.infer<typeof AdminSystemToolDetailSchema>;
