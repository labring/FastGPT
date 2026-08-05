import z from 'zod';
import { ObjectIdSchema } from '../../../common/type/mongo';
import { BoolSchema, IntSchema } from '../../../common/zod';

export const DEFAULT_DANGLING_PERMISSION_BATCH_SIZE = 500;
export const DEFAULT_DANGLING_PERMISSION_MAX_SCAN = 10000;
export const DEFAULT_DANGLING_PERMISSION_SAMPLE_LIMIT = 20;

export const DanglingReferenceReasonSchema = z.enum([
  'missingTeam',
  'missingTeamMember',
  'missingGroup',
  'missingOrg',
  'missingApp',
  'missingDataset',
  'missingAgentSkill',
  'missingResourceId'
]);
export type DanglingReferenceReason = z.infer<typeof DanglingReferenceReasonSchema>;

export const CleanupDanglingResourcePermissionsOptionsSchema = z.object({
  dryRun: z.boolean(),
  batchSize: z.number().int().min(1).max(5000),
  maxScan: z.number().int().min(1).max(100000),
  sampleLimit: z.number().int().min(0).max(100),
  cursor: ObjectIdSchema.optional()
});
export type CleanupDanglingResourcePermissionsOptions = z.infer<
  typeof CleanupDanglingResourcePermissionsOptionsSchema
>;

export const CleanupDanglingResourcePermissionsBodySchema = z
  .object({
    dryRun: BoolSchema.optional().meta({
      example: true,
      description: '是否只扫描统计不删除，默认为 true'
    }),
    dryrun: BoolSchema.optional().meta({
      example: true,
      description: '是否只扫描统计不删除，兼容小写参数'
    }),
    batchSize: IntSchema.min(1).max(5000).optional().meta({
      example: DEFAULT_DANGLING_PERMISSION_BATCH_SIZE,
      description: '每批扫描的权限记录数，范围 1~5000'
    }),
    maxScan: IntSchema.min(1).max(100000).optional().meta({
      example: DEFAULT_DANGLING_PERMISSION_MAX_SCAN,
      description: '单次请求最多扫描的权限记录数，范围 1~100000'
    }),
    sampleLimit: IntSchema.min(0).max(100).optional().meta({
      example: DEFAULT_DANGLING_PERMISSION_SAMPLE_LIMIT,
      description: '返回的悬垂权限样本数，范围 0~100'
    }),
    cursor: ObjectIdSchema.optional().meta({
      description: '上一次响应返回的 nextCursor，用于继续扫描'
    })
  })
  .transform((body) =>
    CleanupDanglingResourcePermissionsOptionsSchema.parse({
      dryRun: body.dryRun ?? body.dryrun ?? true,
      batchSize: body.batchSize ?? DEFAULT_DANGLING_PERMISSION_BATCH_SIZE,
      maxScan: body.maxScan ?? DEFAULT_DANGLING_PERMISSION_MAX_SCAN,
      sampleLimit: body.sampleLimit ?? DEFAULT_DANGLING_PERMISSION_SAMPLE_LIMIT,
      cursor: body.cursor
    })
  );

export const DanglingPermissionSampleSchema = z.object({
  permissionId: z.string().meta({ description: '悬垂权限记录 ID' }),
  teamId: z.string().meta({ description: '权限记录中的团队 ID' }),
  resourceType: z.string().meta({ description: '权限资源类型' }),
  resourceId: z.string().optional().meta({ description: '权限资源 ID' }),
  danglingReferences: z
    .array(DanglingReferenceReasonSchema)
    .meta({ description: '该权限记录命中的悬垂引用类型' })
});

export const DanglingReferenceReasonCountsSchema = z.object({
  missingTeam: z.number().int().nonnegative().meta({ description: '团队引用缺失数量' }),
  missingTeamMember: z.number().int().nonnegative().meta({ description: '成员引用缺失数量' }),
  missingGroup: z.number().int().nonnegative().meta({ description: '成员组引用缺失数量' }),
  missingOrg: z.number().int().nonnegative().meta({ description: '组织引用缺失数量' }),
  missingApp: z.number().int().nonnegative().meta({ description: '应用引用缺失数量' }),
  missingDataset: z.number().int().nonnegative().meta({ description: '知识库引用缺失数量' }),
  missingAgentSkill: z.number().int().nonnegative().meta({ description: '技能引用缺失数量' }),
  missingResourceId: z.number().int().nonnegative().meta({ description: '资源 ID 缺失数量' })
});

export const CleanupDanglingResourcePermissionsResponseSchema = z.object({
  dryRun: z.boolean().meta({ description: '是否 dry-run' }),
  scannedPermissionCount: z.number().int().nonnegative().meta({ description: '扫描权限记录数' }),
  danglingPermissionCount: z
    .number()
    .int()
    .nonnegative()
    .meta({ description: '存在至少一个悬垂引用的权限记录数' }),
  deletedPermissionCount: z
    .number()
    .int()
    .nonnegative()
    .meta({ description: '实际删除的权限记录数，dry-run 时为 0' }),
  reasonCounts: DanglingReferenceReasonCountsSchema.meta({
    description: '按悬垂引用类型统计的命中数，同一权限可能命中多种类型'
  }),
  batchSize: z.number().int().positive().meta({ description: '扫描批大小' }),
  maxScan: z.number().int().positive().meta({ description: '单次扫描数量上限' }),
  sampleLimit: z.number().int().nonnegative().meta({ description: '返回样本数量限制' }),
  nextCursor: z.string().optional().meta({ description: '继续扫描时使用的游标' }),
  samples: z.array(DanglingPermissionSampleSchema).meta({ description: '悬垂权限样本' })
});
export type CleanupDanglingResourcePermissionsResult = z.infer<
  typeof CleanupDanglingResourcePermissionsResponseSchema
>;
