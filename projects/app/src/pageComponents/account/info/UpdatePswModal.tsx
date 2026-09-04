import PasswordChangeModal from '@/components/support/user/safe/PasswordChangeModal';

const UpdatePswModal = ({ onClose }: { onClose: () => void }) => (
  <PasswordChangeModal onClose={onClose} onSuccess={onClose} />
);

export default UpdatePswModal;
