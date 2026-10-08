import { serviceSideProps } from '@/web/common/i18n/utils';
import ModelProvider from '@/pageComponents/admin/config/ModelProvider';

export async function getServerSideProps(content: any) {
  return {
    props: {
      ...(await serviceSideProps(content, ['admin']))
    }
  };
}

export default ModelProvider;
