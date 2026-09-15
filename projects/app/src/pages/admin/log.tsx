'use client';
import AdminContainer from '@/pageComponents/admin/AdminContainer';
import LogTable from '@/pageComponents/admin/log/index';

const AdminPage = () => {
  return (
    <AdminContainer>
      <LogTable />
    </AdminContainer>
  );
};

export default AdminPage;
