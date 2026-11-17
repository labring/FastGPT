'use client';
import AdminContainer from '@/pageComponents/admin/AdminContainer';
import ModerationPolicy from '@/pageComponents/admin/moderation/policy';

const AdminModerationPolicyPage = () => {
  return (
    <AdminContainer>
      <ModerationPolicy />
    </AdminContainer>
  );
};

export default AdminModerationPolicyPage;
