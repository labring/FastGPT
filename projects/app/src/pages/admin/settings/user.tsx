'use client';
import AdminContainer from '@/pageComponents/admin/AdminContainer';
import UserSetting from '@/pageComponents/admin/config/user';

const AdminPage = () => {
  return (
    <AdminContainer>
      <UserSetting />
    </AdminContainer>
  );
};

export default AdminPage;
