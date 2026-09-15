'use client';
import AdminContainer from '@/pageComponents/admin/AdminContainer';
import TrafficPage from '@/pageComponents/admin/dashboard/traffic';

const AdminPage = () => {
  return (
    <AdminContainer>
      <TrafficPage />
    </AdminContainer>
  );
};

export default AdminPage;
