'use client';
import AdminContainer from '@/pageComponents/admin/AdminContainer';
import TeamTable from '@/pageComponents/admin/teams/index';

const AdminPage = () => {
  return (
    <AdminContainer>
      <TeamTable />
    </AdminContainer>
  );
};

export default AdminPage;
