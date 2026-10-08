import { serviceSideProps } from '@/web/common/i18n/utils';
import AdminContainer from '@/pageComponents/admin/AdminContainer';
import AppTemplate from '@/pageComponents/admin/templates/app/index';

const AdminPage = () => {
  return (
    <AdminContainer>
      <AppTemplate />
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
