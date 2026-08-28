'use client';
import AdminContainer from '@/pageComponents/admin/AdminContainer';
import DashboardOverview from '@/pageComponents/admin/dashboard/index';

const AdminPage = () => {
  return (
    <AdminContainer>
      <DashboardOverview />
    </AdminContainer>
  );
};

export default AdminPage;
