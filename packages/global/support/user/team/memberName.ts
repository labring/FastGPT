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

/** 将交互式成员名规范化并在非法输入时抛出参数错误。 */
export const normalizeTeamMemberName = (memberName: unknown): TeamMemberName =>
  TeamMemberNameSchema.parse(memberName);

/** 仅返回有效成员名，供注册和同步等非交互式入口选择明确的缺省值。 */
export const getValidTeamMemberName = (memberName: unknown): TeamMemberName | undefined => {
  const result = TeamMemberNameSchema.safeParse(memberName);
  return result.success ? result.data : undefined;
};

/**
 * 计算团队成员的对外展示名。
 * 待补齐保留值属于内部状态，不能直接展示给用户；此时优先回落到登录用户名，
 * 用户名同样缺失时返回 fallback（默认空串），由调用方决定占位文案，避免在多处硬编码英文字面量。
 */
export const getTeamMemberDisplayName = ({
  memberName,
  username,
  fallback = ''
}: {
  memberName?: string;
  username?: string;
  fallback?: string;
}) => {
  if (memberName && memberName !== UNSET_TEAM_MEMBER_NAME) return memberName;
  return username ? username : fallback;
};
