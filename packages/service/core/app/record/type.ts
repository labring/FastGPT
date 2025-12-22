import { z } from 'zod';

// Zod schemas
export const AppRecordSchemaZod = z.object({
  _id: z.string().optional(),
  tmbId: z.string(),
  teamId: z.string(),
  appId: z.string(),
  lastUsedTime: z.date()
});

// 创建应用记录时的 schema（不包含 _id）
export const CreateAppRecordSchemaZod = AppRecordSchemaZod.omit({
  _id: true
});

// 更新应用记录时的 schema（部分字段可选）
export const UpdateAppRecordSchemaZod = AppRecordSchemaZod.partial().omit({
  _id: true,
  tmbId: true,
  teamId: true,
  appId: true
});

// 查询参数的 schema
export const AppRecordQuerySchemaZod = z.object({
  tmbId: z.string().optional(),
  teamId: z.string().optional(),
  appId: z.string().optional(),
  lastUsedTime: z
    .union([
      z.date(),
      z.object({
        gte: z.date().optional(),
        lte: z.date().optional(),
        gt: z.date().optional(),
        lt: z.date().optional()
      })
    ])
    .optional()
});

// TypeScript types inferred from Zod schemas
export type AppRecordType = z.infer<typeof AppRecordSchemaZod>;
export type CreateAppRecordType = z.infer<typeof CreateAppRecordSchemaZod>;
export type UpdateAppRecordType = z.infer<typeof UpdateAppRecordSchemaZod>;
export type AppRecordQueryType = z.infer<typeof AppRecordQuerySchemaZod>;

// 兼容旧版本的类型定义（保持向后兼容）
export type {
  AppRecordType as AppRecordSchemaType,
  CreateAppRecordType as AppRecordCreateType,
  UpdateAppRecordType as AppRecordUpdateType
};

// 应用记录统计类型
export const AppRecordStatsSchemaZod = z.object({
  totalRecords: z.number().min(0),
  uniqueApps: z.number().min(0),
  mostUsedApp: z
    .object({
      appId: z.string(),
      usageCount: z.number().min(0)
    })
    .optional(),
  lastUsedTime: z.date().optional()
});

export type AppRecordStatsType = z.infer<typeof AppRecordStatsSchemaZod>;
