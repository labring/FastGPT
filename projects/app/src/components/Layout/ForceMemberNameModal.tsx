import { useRouter } from 'next/router';
import { useSafeTranslation } from '@fastgpt/web/hooks/useSafeTranslation';
import MemberNameFormModal from '@/pageComponents/account/team/MemberNameForm';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { clearToken } from '@/web/support/user/auth';
import { useUserStore } from '@/web/support/user/useUserStore';

/**
 * 强制补齐当前团队成员名。
 * 弹窗不可关闭；提交后刷新用户信息仍处于待补齐状态时保留弹窗，允许用户重试。
 */
const ForceMemberNameModal = ({ onSuccess }: { onSuccess: () => void }) => {
  const { t } = useSafeTranslation();
  const { feConfigs } = useSystemStore();
  const { setUserInfo } = useUserStore();
  const router = useRouter();

  // 企业同步姓名异常时允许用户安全退出，由管理员修复 SSO 映射后再登录；
  // 退出不等于完成姓名补齐，不修改任何成员数据。
  const handleExit = async () => {
    await clearToken();
    setUserInfo(null);
    await router.replace('/login');
  };

  return (
    <MemberNameFormModal
      // 不预填账号或工号，避免用户一次确认就把回落值标记为已设置姓名。
      defaultName=""
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
