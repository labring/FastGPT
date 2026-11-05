import z from 'zod';
import { ObjectIdSchema } from '../../../common/type/mongo';
import { BoolSchema } from '../../../common/zod';
import { SourceMemberSchema } from '../../user/type';
import { UsageSourceEnum } from './constants';

// ObjectId 的大小写表示同一资源，先统一表示再去重或校验规则冲突。
const UsageObjectIdSchema = ObjectIdSchema.overwrite((id) => id.toLowerCase());
const UsageIdsSchema = z.array(UsageObjectIdSchema).overwrite((ids) => [...new Set(ids)]);

export const UsageDepartmentRuleSchema = z.strictObject({
  orgId: UsageObjectIdSchema.meta({ description: '部门 ID' }),
  include: BoolSchema.meta({ description: '包含或排除此部门及其后代' })
});
export type UsageDepartmentRule = z.infer<typeof UsageDepartmentRuleSchema>;

export const UsageSubjectFilterSchema = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('member').meta({ description: '按成员筛选' }),
    ids: UsageIdsSchema.meta({ description: '成员 ID，空数组表示全部' })
  }),
  z.strictObject({
    type: z.literal('department').meta({ description: '按部门筛选' }),
    rules: z
      .array(UsageDepartmentRuleSchema)
      .superRefine((rules, ctx) => {
        const ids = new Set<string>();
        rules.forEach((rule, index) => {
          if (ids.has(rule.orgId)) {
            ctx.addIssue({
              code: 'custom',
              path: [index, 'orgId'],
              message: 'Duplicate department rule'
            });
          }
          ids.add(rule.orgId);
        });
      })
      .meta({ description: '按最近祖先生效的子树覆盖规则' })
  }),
  z.strictObject({
    type: z.literal('group').meta({ description: '按群组筛选' }),
    ids: UsageIdsSchema.meta({ description: '群组 ID，空数组表示全部' })
  })
]);
export type UsageSubjectFilter = z.infer<typeof UsageSubjectFilterSchema>;

export const UsageCommonFiltersSchema = z
  .object({
    dateStart: z.iso.datetime({ offset: true }).meta({
      description: '包含时区的开始时间（闭区间）',
      example: '2026-11-01T00:00:00+08:00'
    }),
    dateEnd: z.iso.datetime({ offset: true }).meta({
      description: '包含时区的结束时间（闭区间）',
      example: '2026-11-03T23:59:59.999+08:00'
    }),
    sources: z
      .array(z.enum(UsageSourceEnum))
      .optional()
      .meta({ description: '来源并集，空数组不限制来源' }),
    projectName: z.string().optional().meta({ description: '按应用名称忽略大小写包含匹配' })
  })
  .refine((value) => Date.parse(value.dateStart) <= Date.parse(value.dateEnd), {
    path: ['dateEnd'],
    message: 'End date must not precede start date'
  });
export type UsageCommonFilters = z.infer<typeof UsageCommonFiltersSchema>;

export const UsageSourceMemberSchema = SourceMemberSchema.extend({
  unavailable: BoolSchema.optional().meta({ description: '成员记录物理缺失' })
});
export type UsageSourceMember = z.infer<typeof UsageSourceMemberSchema>;

export const UsageSelectedItemSchema = UsageSourceMemberSchema.extend({
  id: ObjectIdSchema.meta({ description: '筛选项 ID' }),
  partial: BoolSchema.optional().meta({ description: '部门子树部分选中' }),
  isDefault: BoolSchema.optional().meta({ description: '默认群组，名称由客户端翻译' })
});
export type UsageSelectedItem = z.infer<typeof UsageSelectedItemSchema>;

export const UsageDepartmentCheckStateSchema = z.object({
  orgId: ObjectIdSchema.meta({ description: '部门 ID' }),
  state: z.enum(['none', 'partial', 'all']).meta({ description: '部门自身和全部后代的三态' })
});
export type UsageDepartmentCheckState = z.infer<typeof UsageDepartmentCheckStateSchema>;

export const UsageFilterNoticeSchema = z.enum([
  'ORG_PATH_RESET',
  'DEPARTMENT_INVALID',
  'GROUP_INVALID',
  'PERMISSION_CHANGED'
]);
export type UsageFilterNotice = z.infer<typeof UsageFilterNoticeSchema>;

export const UsageFilterContextSchema = z.object({
  requestKey: z.string().meta({ description: '客户端操作标识，仅用于响应匹配' }),
  canManageMembers: BoolSchema.meta({ description: '当前是否拥有团队管理权限' }),
  scope: z.enum(['team', 'self']).meta({ description: '当前授权范围' }),
  subjectFilter: UsageSubjectFilterSchema.meta({ description: '服务端标准化后的选择' }),
  selectedItems: z
    .array(UsageSelectedItemSchema)
    .meta({ description: '当前选中项资料，不包含解析成员范围' }),
  departmentCheckStates: z
    .array(UsageDepartmentCheckStateSchema)
    .optional()
    .meta({ description: '可见部门的三态' }),
  notices: z.array(UsageFilterNoticeSchema).meta({ description: '本次操作发现的业务变化' }),
  selectionChanged: BoolSchema.meta({ description: '校验导致选择改变' }),
  scopeChanged: BoolSchema.meta({ description: '当前授权范围与请求期望不同' }),
  resetPagination: BoolSchema.meta({ description: '本次结果从第一页开始' })
});
export type UsageFilterContext = z.infer<typeof UsageFilterContextSchema>;

export const UsageFilterOptionSchema = UsageSelectedItemSchema.extend({
  hasChildren: BoolSchema.optional().meta({ description: '部门是否有直接子部门' }),
  path: z
    .array(
      z.object({
        id: ObjectIdSchema.meta({ description: '路径部门 ID' }),
        name: z.string().meta({ description: '路径部门名称' })
      })
    )
    .optional()
    .meta({ description: '部门完整定位路径' })
});
export type UsageFilterOption = z.infer<typeof UsageFilterOptionSchema>;
