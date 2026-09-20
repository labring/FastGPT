'use client';
import AdminContainer from '@/pageComponents/admin/AdminContainer';
import PlanTable from '@/pageComponents/admin/plans/index';

const AdminPage = () => {
  return (
    <AdminContainer>
      <PlanTable />
    </AdminContainer>
  );
};

export default AdminPage;
