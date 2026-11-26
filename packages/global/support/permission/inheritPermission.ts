import { BoolSchema } from '../../common/zod';

/* ===== Inherit permission ===== */
// 创建时的继承态开关：知识库、应用、工具、Skill 及各自文件夹创建共用；collection 创建仍只对文件夹生效。
const inheritPermissionMetadata = {
  example: true,
  description:
    '是否继承父级权限（默认 true）：true = 创建时合并父级权限快照，并跟随父级后续权限变更；false = 独立创建，仅写创建者 owner 权限，不合并父级权限，父级后续权限变更也不再传播到该节点'
};
export const InheritPermissionSchema = BoolSchema.optional().meta(inheritPermissionMetadata);

// API 入参解析时，未提供该字段按继承态处理；内部 service schema 仍可使用可选的基础 schema。
export const InheritPermissionInputSchema =
  InheritPermissionSchema.default(true).meta(inheritPermissionMetadata);

/** API 请求可省略继承标记，但 schema 解析后的结果始终包含 boolean 值。 */
export type WithOptionalInheritPermission<T extends { inheritPermission: boolean }> = Omit<
  T,
  'inheritPermission'
> &
  Partial<Pick<T, 'inheritPermission'>>;
