import z from 'zod';
import { BoolSchema, IntSchema } from '../../../common/zod';
import type { SkillPermission } from './controller';

// HTTP 响应会把 SkillPermission 类实例序列化为普通对象，声明前端实际依赖的技能权限字段。
const SkillPermissionObjectSchema = z
  .object({
    role: IntSchema.meta({ description: '技能权限角色值' }),
    isOwner: BoolSchema.meta({ description: '是否为技能所有者' }),
    hasManagePer: BoolSchema.meta({ description: '是否拥有技能管理权限' }),
    hasWritePer: BoolSchema.meta({ description: '是否拥有技能写权限' }),
    hasReadPer: BoolSchema.meta({ description: '是否拥有技能读权限' }),
    hasManageRole: BoolSchema.meta({ description: '是否包含技能管理角色' }),
    hasWriteRole: BoolSchema.meta({ description: '是否包含技能写角色' }),
    hasReadRole: BoolSchema.meta({ description: '是否包含技能读角色' })
  })
  .passthrough()
  .meta({ description: '技能权限对象序列化后的 JSON 结构' });

export const SkillPermissionSchema =
  SkillPermissionObjectSchema as unknown as z.ZodType<SkillPermission>;
