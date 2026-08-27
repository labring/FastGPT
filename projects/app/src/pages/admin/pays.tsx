'use client';
import AdminContainer from '@/pageComponents/admin/AdminContainer';
import BillTable from '@/pageComponents/admin/pays/index';

const AdminPage = () => {
  return (
    <AdminContainer>
      <BillTable />
    </AdminContainer>
  );
};

export default AdminPage;
