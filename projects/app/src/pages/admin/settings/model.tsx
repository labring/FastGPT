'use client';
import AdminContainer from '@/pageComponents/admin/AdminContainer';
import ModelSettings from '@/pageComponents/admin/config/model';

const AdminPage = () => {
  return (
    <AdminContainer>
      <ModelSettings />
    </AdminContainer>
  );
};

export default AdminPage;
