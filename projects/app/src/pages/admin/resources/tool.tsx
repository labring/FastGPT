import { serviceSideProps } from '@/web/common/i18n/utils';
import ToolProvider from '@/pageComponents/admin/config/ToolProvider';

export async function getServerSideProps(content: any) {
  return {
    props: {
      ...(await serviceSideProps(content, ['admin']))
    }
  };
}

export default ToolProvider;
