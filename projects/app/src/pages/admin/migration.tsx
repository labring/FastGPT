'use client';
import AdminContainer from '@/pageComponents/admin/AdminContainer';
import Migration from '@/pageComponents/admin/config/Migration';

const AdminPage = () => {
  return (
    <AdminContainer>
      <Migration />
    </AdminContainer>
  );
};

export default AdminPage;
