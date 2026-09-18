import { UNSET_TEAM_MEMBER_NAME } from '@fastgpt/global/support/user/team/constant';
import { useClientTranslation } from '@fastgpt/web/i18n/useClientTranslation';
import MemberNameFormModal from '@/pageComponents/account/team/MemberNameForm';
import { useUserStore } from '@/web/support/user/useUserStore';

/**
 * 强制补齐当前团队成员名。
 * 弹窗不可关闭；提交后刷新用户信息仍是保留值时保留弹窗，允许用户重试。
 */
const ForceMemberNameModal = ({ onSuccess }: { onSuccess: () => void }) => {
  const { t } = useClientTranslation('account_team');
  const { userInfo } = useUserStore();

  return (
    <MemberNameFormModal
      defaultName={userInfo?.username ?? ''}
      dismissible={false}
      placeholder={t('account_team:invite_member_name_placeholder')}
      onSubmitted={(latestUserInfo) => {
        // 刷新后仍是保留值说明补齐没有生效，保留弹窗让用户重试。
        if (latestUserInfo?.team?.memberName !== UNSET_TEAM_MEMBER_NAME) onSuccess();
      }}
    />
  );
};

export default ForceMemberNameModal;
