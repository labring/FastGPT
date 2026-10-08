import { serviceSideProps } from '@/web/common/i18n/utils';
import AdminContainer from '@/pageComponents/admin/AdminContainer';
import AdminHome from '@/pageComponents/admin/home';

const AdminPage = () => {
  return (
    <AdminContainer>
      <AdminHome />
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
