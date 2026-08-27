'use client';
import AdminContainer from '@/pageComponents/admin/AdminContainer';
import ActivePage from '@/pageComponents/admin/dashboard/active';

const AdminPage = () => {
  return (
    <AdminContainer>
      <ActivePage />
    </AdminContainer>
  );
};

export default AdminPage;
