import { useRouter } from 'next/router';
import { getValidTeamMemberName } from '@fastgpt/global/support/user/team/memberName';
import { useSafeTranslation } from '@fastgpt/web/hooks/useSafeTranslation';
import MemberNameFormModal from '@/pageComponents/account/team/MemberNameForm';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { clearToken } from '@/web/support/user/auth';
import { useUserStore } from '@/web/support/user/useUserStore';

/**
 * 已有成员显示名可作为补齐时的初始建议，但不得使用登录账号或 schema 回落值。
 * 注意：该字段不携带 SSO 来源证明；此函数只负责安全预填，不改变 isSetMemberName。
 */
export const getExistingMemberNamePrefill = ({
  memberName,
  username
}: {
  memberName?: string;
  username?: string;
}): string => {
  const name = getValidTeamMemberName(memberName);
  if (!name || name === 'Member' || name === (username ?? '').trim()) return '';
  return name;
};

/**
 * 强制补齐当前团队成员名。
 * 弹窗不可关闭；提交后刷新用户信息仍处于待补齐状态时保留弹窗，允许用户重试。
 */
const ForceMemberNameModal = ({ onSuccess }: { onSuccess: () => void }) => {
  const { t } = useSafeTranslation();
  const { feConfigs } = useSystemStore();
  const { setUserInfo, userInfo } = useUserStore();
  const router = useRouter();
  // 前端只展示已存储的候选成员名；SSO 是否真正提供了该姓名由 Pro 登录链路确认。
  // 若 Pro 已正确设置 isSetMemberName=true，则编排器不会展示此弹窗。
  const defaultMemberName = getExistingMemberNamePrefill({
    memberName: userInfo?.team?.memberName,
    username: userInfo?.username
  });
  const isSyncNameCandidate = feConfigs?.teamMode === 'sync' && !!defaultMemberName;

  // 企业同步姓名异常时允许用户安全退出，由管理员修复 SSO 映射后再登录；
  // 退出不等于完成姓名补齐，不修改任何成员数据。
  const handleExit = async () => {
    await clearToken();
    setUserInfo(null);
    await router.replace('/login');
  };

  return (
    <MemberNameFormModal
      // 优先展示已有的成员显示名；没有可用候选名时留空，绝不回落到登录账号。
      defaultName={defaultMemberName}
      // 同步模式中已有候选名不可在此被人工改写；姓名来源仍须服务端验证。
      readOnlyName={isSyncNameCandidate}
      dismissible={false}
      onExit={feConfigs?.teamMode === 'sync' ? handleExit : undefined}
      helperText={
        feConfigs?.teamMode === 'sync'
          ? t('account_team:force_member_name_sync_hint')
          : t('account_team:force_member_name_hint')
      }
      placeholder={t('account_team:invite_member_name_placeholder')}
      onSubmitted={(latestUserInfo) => {
        // 刷新后仍待补齐说明提交没有生效，保留弹窗让用户重试。
        // 只有刷新后明确确认姓名状态为 true 才结束强制流程。
        // 刷新失败得到 null 时，不能将未知结果视为已设置姓名。
        if (latestUserInfo?.team?.isSetMemberName === true) onSuccess();
      }}
    />
  );
};

export default ForceMemberNameModal;
