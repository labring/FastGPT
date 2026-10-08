import { serviceSideProps } from '@/web/common/i18n/utils';
import AdminContainer from '@/pageComponents/admin/AdminContainer';
import DashboardOverview from '@/pageComponents/admin/dashboard/index';

const AdminPage = () => {
  return (
    <AdminContainer>
      <DashboardOverview />
    </AdminContainer>
  );
};

export async function getServerSideProps(content: any) {
  return {
    props: {
      ...(await serviceSideProps(content, ['admin']))
    }
  };
}

export default AdminPage;
