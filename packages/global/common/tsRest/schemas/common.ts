import { z } from 'zod';

// 基础类型 schemas
export const ObjectIdSchema = z
  .string()
  .min(24)
  .max(24)
  .describe('MongoDB ObjectId 格式的字符串，长度为24个字符');

// 通用返回值类型
export const CommonResponseSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    code: z.number().describe('状态码'),
    message: z.string().describe('消息'),
    data: dataSchema.describe('数据'),
    statusText: z.string().describe('状态文本')
  });

// 通用请求参数类型
export const ParentIdSchema = z
  .union([ObjectIdSchema, z.null(), z.undefined()])
  .describe('父级ID，可以是ObjectId或null（表示根级）');

// 分页相关
export const PaginationRequestSchema = z
  .object({
    pageIndex: z.number().min(1).default(1).describe('页码，从1开始'),
    pageSize: z.number().min(1).max(100).default(10).describe('每页条数，最大100条')
  })
  .describe('分页请求参数');

export const PaginationResponseSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z
    .object({
      total: z.number().min(0).describe('总记录数'),
      list: z.array(dataSchema).describe('数据列表')
    })
    .describe('分页响应格式');

// 时间相关
export const DateTimeSchema = z.date().describe('ISO 8601 格式的时间字符串');

export const OptionalDateTimeSchema = DateTimeSchema.optional();

// 权限相关
export const PermissionSchema = z
  .object({
    hasReadPer: z.boolean().describe('是否有读取权限'),
    hasWritePer: z.boolean().describe('是否有写入权限'),
    hasManagePer: z.boolean().describe('是否有管理权限'),
    isOwner: z.boolean().describe('是否为所有者')
  })
  .describe('用户权限信息');

// 用户成员信息
export const SourceMemberSchema = z
  .object({
    tmbId: ObjectIdSchema.optional().describe('团队成员ID'),
    avatar: z.string().optional().describe('用户头像URL'),
    name: z.string().describe('用户名称')
  })
  .describe('用户成员信息');

// UTM 参数
export const UtmParamsSchema = z
  .object({
    utm_source: z.string().optional().describe('流量来源'),
    utm_medium: z.string().optional().describe('推广媒介'),
    utm_campaign: z.string().optional().describe('推广活动'),
    utm_content: z.string().optional().describe('推广内容'),
    utm_term: z.string().optional().describe('推广关键词')
  })
  .describe('UTM 统计参数');

// 任意类型数据的响应
export const AnyResponseSchema = CommonResponseSchema(z.any());
