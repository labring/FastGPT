import z from 'zod';
import { ObjectIdSchema } from '@fastgpt/global/common/type/mongo';
import { BoolSchema, IntSchema } from '@fastgpt/global/common/zod';

export const PERMISSION_CLEANUP_BATCH_SIZE = 1000;
export const ACL_RESOURCE_BATCH_SIZE = 1000;
export const DEFAULT_PERMISSION_TEAM_CONCURRENCY = 100;
export const DEFAULT_DANGLING_PERMISSION_SAMPLE_LIMIT = 20;

export const DanglingReferenceReasonSchema = z.enum([
  'missingTeam',
  'missingTeamMember',
  'missingGroup',
  'missingOrg',
  'missingApp',
  'missingDataset',
  'missingAgentSkill',
  'missingResourceId',
  'missingCollaboratorTarget',
  'multipleCollaboratorTargets'
]);
export type DanglingReferenceReason = z.infer<typeof DanglingReferenceReasonSchema>;

export const CleanupDanglingResourcePermissionsOptionsSchema = z.object({
  dryRun: z.boolean(),
  teamId: ObjectIdSchema.optional(),
  batchSize: z.number().int().min(1).max(1000),
  sampleLimit: z.number().int().min(0).max(100)
});
export type CleanupDanglingResourcePermissionsOptions = z.infer<
  typeof CleanupDanglingResourcePermissionsOptionsSchema
>;

export const InitPermissionBodySchema = z.object({
  dryRun: BoolSchema.optional().default(true).meta({
    example: true,
    description: '是否仅扫描无效权限并预览迁移结果，默认为 true'
  }),
  teamId: ObjectIdSchema.optional().meta({
    example: '68ad85a7463006c963799a05',
    description: '仅处理指定团队；不传时处理所有团队和权限'
  }),
  teamConcurrency: IntSchema.min(1)
    .max(1000)
    .optional()
    .default(DEFAULT_PERMISSION_TEAM_CONCURRENCY)
    .meta({
      example: DEFAULT_PERMISSION_TEAM_CONCURRENCY,
      description: 'ACL 迁移同时处理的团队数，范围 1~1000'
    }),
  sampleLimit: IntSchema.min(0)
    .max(100)
    .optional()
    .default(DEFAULT_DANGLING_PERMISSION_SAMPLE_LIMIT)
    .meta({
      example: DEFAULT_DANGLING_PERMISSION_SAMPLE_LIMIT,
      description: '返回的无效权限样本数，范围 0~100'
    })
});
export type InitPermissionBody = z.infer<typeof InitPermissionBodySchema>;

export const DanglingPermissionSampleSchema = z.object({
  permissionId: z.string().meta({ description: '待清理权限记录 ID' }),
  teamId: z.string().meta({ description: '权限记录中的团队 ID' }),
  resourceType: z.string().meta({ description: '权限资源类型' }),
  resourceId: z.string().optional().meta({ description: '权限资源 ID' }),
  danglingReferences: z
    .array(DanglingReferenceReasonSchema)
    .meta({ description: '该权限记录命中的清理原因' })
});

export const DanglingReferenceReasonCountsSchema = z.object({
  missingTeam: z.number().int().nonnegative().meta({ description: '团队引用缺失数量' }),
  missingTeamMember: z.number().int().nonnegative().meta({ description: '成员引用缺失数量' }),
  missingGroup: z.number().int().nonnegative().meta({ description: '成员组引用缺失数量' }),
  missingOrg: z.number().int().nonnegative().meta({ description: '组织引用缺失数量' }),
  missingApp: z.number().int().nonnegative().meta({ description: '应用引用缺失数量' }),
  missingDataset: z.number().int().nonnegative().meta({ description: '知识库引用缺失数量' }),
  missingAgentSkill: z.number().int().nonnegative().meta({ description: '技能引用缺失数量' }),
  missingResourceId: z.number().int().nonnegative().meta({ description: '资源 ID 缺失数量' }),
  missingCollaboratorTarget: z
    .number()
    .int()
    .nonnegative()
    .meta({ description: '未指定成员、成员组或组织节点的权限数量' }),
  multipleCollaboratorTargets: z
    .number()
    .int()
    .nonnegative()
    .meta({ description: '同时指定多个协作者目标的权限数量' })
});

export const CleanupDanglingResourcePermissionsResponseSchema = z.object({
  dryRun: z.boolean().meta({ description: '是否 dry-run' }),
  scannedPermissionCount: z.number().int().nonnegative().meta({ description: '扫描权限记录数' }),
  danglingPermissionCount: z
    .number()
    .int()
    .nonnegative()
    .meta({ description: '存在至少一个悬垂引用或非法协作者目标的权限记录总数' }),
  danglingReferencePermissionCount: z
    .number()
    .int()
    .nonnegative()
    .meta({ description: '存在至少一个悬垂外部引用的权限记录数' }),
  invalidCollaboratorPermissionCount: z
    .number()
    .int()
    .nonnegative()
    .meta({ description: '协作者目标数量不等于一个的权限记录数' }),
  deletedPermissionCount: z
    .number()
    .int()
    .nonnegative()
    .meta({ description: '实际删除的权限记录数，dry-run 时为 0' }),
  reasonCounts: DanglingReferenceReasonCountsSchema.meta({
    description: '按清理原因统计的命中数，同一权限可能命中多种类型'
  }),
  batchSize: z.number().int().positive().meta({ description: '扫描批大小' }),
  sampleLimit: z.number().int().nonnegative().meta({ description: '返回样本数量限制' }),
  samples: z.array(DanglingPermissionSampleSchema).meta({ description: '待清理权限样本' })
});
export type CleanupDanglingResourcePermissionsResult = z.infer<
  typeof CleanupDanglingResourcePermissionsResponseSchema
>;

export const MaterializeResourcePermissionsOptionsSchema = z.object({
  dryRun: z.boolean(),
  teamId: ObjectIdSchema.optional(),
  batchSize: z.number().int().min(1).max(1000),
  teamConcurrency: z.number().int().min(1).max(1000)
});
export type MaterializeResourcePermissionsOptions = z.infer<
  typeof MaterializeResourcePermissionsOptionsSchema
>;

export const MaterializeResourcePermissionsResultSchema = z.object({
  dryRun: z.boolean(),
  teamCount: z.number().int().nonnegative(),
  resourceCount: z.number().int().nonnegative(),
  updatedResourceCount: z.number().int().nonnegative(),
  skippedResourceCount: z.number().int().nonnegative(),
  errors: z.array(z.string())
});
export type MaterializeResourcePermissionsResult = z.infer<
  typeof MaterializeResourcePermissionsResultSchema
>;

export const InitPermissionResponseSchema = z.object({
  cleanup: CleanupDanglingResourcePermissionsResponseSchema,
  migration: MaterializeResourcePermissionsResultSchema
});
export type InitPermissionResponse = z.infer<typeof InitPermissionResponseSchema>;
