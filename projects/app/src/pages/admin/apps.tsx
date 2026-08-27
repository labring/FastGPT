'use client';
import AdminContainer from '@/pageComponents/admin/AdminContainer';
import AppTable from '@/pageComponents/admin/apps/index';

const AdminPage = () => {
  return (
    <AdminContainer>
      <AppTable />
    </AdminContainer>
  );
};

export default AdminPage;
