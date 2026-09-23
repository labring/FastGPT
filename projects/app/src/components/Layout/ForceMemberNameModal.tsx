import { useSafeTranslation } from '@fastgpt/web/hooks/useSafeTranslation';
import MemberNameFormModal from '@/pageComponents/account/team/MemberNameForm';
import { useUserStore } from '@/web/support/user/useUserStore';

/**
 * 强制补齐当前团队成员名。
 * 弹窗不可关闭；提交后刷新用户信息仍处于待补齐状态时保留弹窗，允许用户重试。
 */
const ForceMemberNameModal = ({ onSuccess }: { onSuccess: () => void }) => {
  const { t } = useSafeTranslation();
  const { userInfo } = useUserStore();

  return (
    <MemberNameFormModal
      defaultName={userInfo?.username ?? ''}
      dismissible={false}
      placeholder={t('account_team:invite_member_name_placeholder')}
      onSubmitted={(latestUserInfo) => {
        // 刷新后仍待补齐说明提交没有生效，保留弹窗让用户重试。
        // 刷新失败时 latestUserInfo 为 null，这里按成功放行：成员名已经写库，
        // 与其把用户关在不可关闭的弹窗里，不如等下次 initUserInfo 纠正本地展示。
        if (latestUserInfo?.team?.memberNamePending !== true) onSuccess();
      }}
    />
  );
};

export default ForceMemberNameModal;
