'use client';
import AdminContainer from '@/pageComponents/admin/AdminContainer';
import DatasetTable from '@/pageComponents/admin/datasets/index';

const AdminPage = () => {
  return (
    <AdminContainer>
      <DatasetTable />
    </AdminContainer>
  );
};

export default AdminPage;
