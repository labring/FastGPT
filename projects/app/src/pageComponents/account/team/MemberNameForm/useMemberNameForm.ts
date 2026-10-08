import { useCallback, useMemo, useState, type ChangeEvent } from 'react';
import type { TFunction } from 'next-i18next';
import { TeamMemberNameSchema } from '@fastgpt/global/support/user/team/memberName';
import { useSafeTranslation } from '@fastgpt/web/hooks/useSafeTranslation';

/**
 * 计算成员名的交互式校验文案。
 * 合法值返回空串，调用方可以直接用返回值判断能否提交；空值和 schema 校验失败分别给出独立提示。
 */
export const getMemberNameError = ({ value, t }: { value: string; t: TFunction }) => {
  if (!value.trim()) return t('account_team:member_name_required');
  return TeamMemberNameSchema.safeParse(value).success ? '' : t('account_team:member_name_limit');
};

/**
 * 成员名表单的共用状态：输入值、交互标记和校验文案。
 * 强制补齐成员名、账号页修改成员名和接受团队邀请三个入口共用同一套规则，
 * 保证提示时机一致：只有用户交互过之后才展示错误，避免弹窗一打开就标红。
 */
export const useMemberNameForm = ({ defaultName }: { defaultName: string }) => {
  const { t } = useSafeTranslation();
  const [memberName, setMemberName] = useState(defaultName);
  const [hasInteracted, setHasInteracted] = useState(false);

  const nameError = useMemo(() => getMemberNameError({ value: memberName, t }), [memberName, t]);

  const markInteracted = useCallback(() => setHasInteracted(true), []);

  const onNameChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setHasInteracted(true);
    setMemberName(event.target.value);
  }, []);

  /** 提交前规范化成员名；调用方需先确认 nameError 为空，否则这里会抛出参数错误。 */
  const parseMemberName = useCallback(() => TeamMemberNameSchema.parse(memberName), [memberName]);

  return {
    memberName,
    nameError,
    showNameError: hasInteracted && !!nameError,
    markInteracted,
    onNameChange,
    parseMemberName
  };
};
