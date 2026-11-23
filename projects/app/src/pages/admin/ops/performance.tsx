import { serviceSideProps } from '@/web/common/i18n/utils';
import AdminContainer from '@/pageComponents/admin/AdminContainer';
import OpsPerformancePage from '@/pageComponents/admin/ops/performance';

const AdminOpsPerformancePage = () => {
  return (
    <AdminContainer>
      <OpsPerformancePage />
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

export default AdminOpsPerformancePage;
