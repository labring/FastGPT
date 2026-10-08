import z from 'zod';

/** 成员名的统一交互式校验规则。 */
export const TeamMemberNameSchema = z
  .string()
  .trim()
  .min(1, '成员名不能为空')
  .max(20, '成员名长度不能超过 20 个字符');

export type TeamMemberName = z.infer<typeof TeamMemberNameSchema>;

/** 将交互式成员名规范化并在非法输入时抛出参数错误。 */
export const normalizeTeamMemberName = (memberName: unknown): TeamMemberName =>
  TeamMemberNameSchema.parse(memberName);

/** 仅返回有效成员名，供注册和同步等非交互式入口选择明确的缺省值。 */
export const getValidTeamMemberName = (memberName: unknown): TeamMemberName | undefined => {
  const result = TeamMemberNameSchema.safeParse(memberName);
  return result.success ? result.data : undefined;
};
