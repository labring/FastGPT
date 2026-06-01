import z from 'zod';
import { BoolSchema, IntSchema } from '../../../common/zod';
import type { AppPermission } from './controller';

// HTTP 响应会把 AppPermission 类实例序列化为普通对象，声明前端实际依赖的应用权限字段。
const AppPermissionObjectSchema = z
  .object({
    role: IntSchema.meta({ description: '应用权限角色值' }),
    isOwner: BoolSchema.meta({ description: '是否为应用所有者' }),
    hasManagePer: BoolSchema.meta({ description: '是否拥有应用管理权限' }),
    hasWritePer: BoolSchema.meta({ description: '是否拥有应用写权限' }),
    hasReadPer: BoolSchema.meta({ description: '是否拥有应用读权限' }),
    hasManageRole: BoolSchema.meta({ description: '是否包含应用管理角色' }),
    hasWriteRole: BoolSchema.meta({ description: '是否包含应用写角色' }),
    hasReadRole: BoolSchema.meta({ description: '是否包含应用读角色' }),
    hasReadChatLogPer: BoolSchema.meta({ description: '是否拥有读取应用对话日志权限' }),
    hasReadChatLogRole: BoolSchema.meta({ description: '是否包含读取应用对话日志角色' })
  })
  .passthrough()
  .meta({ description: '应用权限对象序列化后的 JSON 结构' });

export const AppPermissionSchema = AppPermissionObjectSchema as unknown as z.ZodType<AppPermission>;

export const AppPermissionCheckSchema = AppPermissionObjectSchema.pick({
  hasReadPer: true,
  hasWritePer: true,
  hasManagePer: true,
  hasReadChatLogPer: true,
  isOwner: true
}).meta({
  description: '当前用户的应用权限检查结果'
});
export type AppPermissionCheckType = z.infer<typeof AppPermissionCheckSchema>;
