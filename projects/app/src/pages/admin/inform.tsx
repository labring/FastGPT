import { serviceSideProps } from '@/web/common/i18n/utils';
import AdminContainer from '@/pageComponents/admin/AdminContainer';
import InformSetting from '@/pageComponents/admin/inform/index';

const AdminPage = () => {
  return (
    <AdminContainer>
      <InformSetting />
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
