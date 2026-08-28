'use client';
import AdminContainer from '@/pageComponents/admin/AdminContainer';
import InvoiceManageTable from '@/pageComponents/admin/invoice/index';

const AdminPage = () => {
  return (
    <AdminContainer>
      <InvoiceManageTable />
    </AdminContainer>
  );
};

export default AdminPage;
