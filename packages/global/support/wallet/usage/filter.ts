import z from 'zod';
import { ObjectIdSchema } from '../../../common/type/mongo';
import { BoolSchema, DateSchema } from '../../../common/zod';
import { SourceMemberSchema } from '../../user/type';
import { UsageSourceEnum } from './constants';

const UsageObjectIdSchema = ObjectIdSchema.overwrite((id) => id.toLowerCase());
const UsageIdsSchema = z.array(UsageObjectIdSchema).overwrite((ids) => [...new Set(ids)]);

export const UsageSubjectFilterSchema = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('member').meta({ description: '按成员筛选' }),
    ids: UsageIdsSchema.meta({ description: '成员 ID，空数组表示全部' })
  }),
  z.strictObject({
    type: z.literal('department').meta({ description: '按部门筛选' }),
    ids: UsageIdsSchema.meta({
      description: '部门 ID（父子勾选独立，查询时包含所选部门及其下属子部门），空数组表示全部'
    })
  }),
  z.strictObject({
    type: z.literal('group').meta({ description: '按群组筛选' }),
    ids: UsageIdsSchema.meta({ description: '群组 ID，空数组表示全部' })
  })
]);
export type UsageSubjectFilter = z.infer<typeof UsageSubjectFilterSchema>;

export const UsageCommonFiltersSchema = z.object({
  dateStart: DateSchema.optional().meta({
    example: '2026-01-01T00:00:00+08:00',
    description: '查询开始时间（包含），按自带偏移解释；无偏移时按服务器时区'
  }),
  dateEnd: DateSchema.optional().meta({
    example: '2026-01-08T00:00:00+08:00',
    description: '查询结束时间（包含），按自带偏移解释；无偏移时按服务器时区'
  }),
  sources: z
    .array(z.enum(UsageSourceEnum))
    .optional()
    .meta({
      example: [UsageSourceEnum.fastgpt, UsageSourceEnum.api],
      description: '使用来源筛选'
    }),
  projectName: z.string().optional().meta({ example: '客服助手', description: '应用名称筛选' })
});
export type UsageCommonFilters = z.infer<typeof UsageCommonFiltersSchema>;

export const UsageSourceMemberSchema = SourceMemberSchema.extend({
  unavailable: BoolSchema.optional().meta({ description: '成员记录物理缺失' })
});
export type UsageSourceMember = z.infer<typeof UsageSourceMemberSchema>;

export const UsageSelectedItemSchema = UsageSourceMemberSchema.extend({
  id: ObjectIdSchema.meta({ description: '筛选项 ID' }),
  isDefault: BoolSchema.optional().meta({ description: '默认群组，名称由客户端翻译' })
});
export type UsageSelectedItem = z.infer<typeof UsageSelectedItemSchema>;

export const UsageFilterNoticeSchema = z.enum([
  'ORG_PATH_RESET',
  'DEPARTMENT_INVALID',
  'GROUP_INVALID',
  'PERMISSION_CHANGED'
]);
export type UsageFilterNotice = z.infer<typeof UsageFilterNoticeSchema>;

export const UsageFilterContextSchema = z.object({
  canManageMembers: BoolSchema.meta({ description: '当前是否拥有团队管理权限' }),
  scope: z.enum(['team', 'self']).meta({ description: '当前授权范围' }),
  subjectFilter: UsageSubjectFilterSchema.meta({ description: '服务端标准化后的选择' }),
  selectedItems: z.array(UsageSelectedItemSchema).meta({ description: '当前选中项资料' }),
  notices: z.array(UsageFilterNoticeSchema).meta({ description: '本次操作发现的业务变化' }),
  selectionChanged: BoolSchema.meta({ description: '校验导致选择改变' }),
  scopeChanged: BoolSchema.meta({ description: '当前授权范围与请求期望不同' }),
  resetPagination: BoolSchema.meta({ description: '本次结果从第一页开始' })
});
export type UsageFilterContext = z.infer<typeof UsageFilterContextSchema>;

export const UsageFilterOptionSchema = UsageSelectedItemSchema.extend({
  hasChildren: BoolSchema.optional().meta({ description: '部门是否有直接子部门' })
});
export type UsageFilterOption = z.infer<typeof UsageFilterOptionSchema>;
