import z from 'zod';
import { UNSET_TEAM_MEMBER_NAME } from './constant';

/**
 * 成员名的统一交互式校验规则。
 * 保留值只用于新成员的待补齐状态，不能被用户或可信外部数据直接提交。
 */
export const TeamMemberNameSchema = z
  .string()
  .trim()
  .min(1, '成员名不能为空')
  .max(20, '成员名长度不能超过 20 个字符')
  .refine((value) => value !== UNSET_TEAM_MEMBER_NAME, '成员名非法！');

export type TeamMemberName = z.infer<typeof TeamMemberNameSchema>;

/** 判断数据库成员名是否仍处于待补齐状态。 */
export const isTeamMemberNamePending = (memberName: unknown): boolean =>
  memberName === UNSET_TEAM_MEMBER_NAME;

/**
 * 归一化成员文档的 isSetMemberName 字段。
 * 新数据由写入路径显式落库；迁移/滚动升级窗口内的存量文档可能缺失该字段，
 * 此时按 name 推断：占位符视为未设置（false），其余视为已设置（true），
 * 保证强制补齐判定在迁移前后一致，不会因字段缺失误弹窗。
 */
export const resolveIsSetMemberName = ({
  memberName,
  isSetMemberName
}: {
  memberName?: string;
  isSetMemberName?: boolean;
}): boolean => isSetMemberName ?? !isTeamMemberNamePending(memberName);

/**
 * 是否强制成员首次登录补齐成员名。
 * isSetMemberName 为 false 表示当前成员名是待确认的回落值；owner 永远豁免（产品规则：owner 不强制补齐）。
 */
export const shouldForceSetMemberName = ({
  memberName,
  isSetMemberName,
  isOwner
}: {
  memberName?: string;
  isSetMemberName?: boolean;
  isOwner?: boolean;
}): boolean => !isOwner && !resolveIsSetMemberName({ memberName, isSetMemberName });

/** 将交互式成员名规范化并在非法输入时抛出参数错误。 */
export const normalizeTeamMemberName = (memberName: unknown): TeamMemberName =>
  TeamMemberNameSchema.parse(memberName);

/** 仅返回有效成员名，供注册和同步等非交互式入口选择明确的缺省值。 */
export const getValidTeamMemberName = (memberName: unknown): TeamMemberName | undefined => {
  const result = TeamMemberNameSchema.safeParse(memberName);
  return result.success ? result.data : undefined;
};
