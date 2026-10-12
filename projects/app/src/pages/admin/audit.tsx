'use client';
import AdminContainer from '@/pageComponents/admin/AdminContainer';
import AuditTable from '@/pageComponents/admin/audit/AuditTable';

const AdminPage = () => {
  return (
    <AdminContainer>
      <AuditTable />
    </AdminContainer>
  );
};

export default AdminPage;
