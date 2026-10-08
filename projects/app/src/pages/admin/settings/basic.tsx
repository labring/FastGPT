import { serviceSideProps } from '@/web/common/i18n/utils';
import AdminContainer from '@/pageComponents/admin/AdminContainer';
import Settings from '@/pageComponents/admin/config/basic';

const AdminPage = () => {
  return (
    <AdminContainer>
      <Settings />
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
