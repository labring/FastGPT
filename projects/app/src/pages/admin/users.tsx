'use client';
import AdminContainer from '@/pageComponents/admin/AdminContainer';
import UserTable from '@/pageComponents/admin/users/index';

const AdminPage = () => {
  return (
    <AdminContainer>
      <UserTable />
    </AdminContainer>
  );
};

export default AdminPage;
