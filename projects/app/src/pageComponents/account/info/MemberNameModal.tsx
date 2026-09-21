import MemberNameFormModal from '@/pageComponents/account/team/MemberNameForm';

type MemberNameModalProps = {
  memberName: string;
  onClose: () => void;
  onSuccess?: () => void;
};

/** 修改当前团队成员名，成功后刷新用户信息、关闭弹窗并通知调用方继续后续动作。 */
const MemberNameModal = ({ memberName, onClose, onSuccess }: MemberNameModalProps) => (
  <MemberNameFormModal
    defaultName={memberName}
    onClose={onClose}
    onSubmitted={() => {
      onClose();
      onSuccess?.();
    }}
  />
);

export default MemberNameModal;
