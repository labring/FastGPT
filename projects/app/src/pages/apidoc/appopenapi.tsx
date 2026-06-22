import { ScalarOpenApiPage } from '@/pageComponents/apidoc/ScalarOpenApiPage';

function AppOpenApiDocPage() {
  return <ScalarOpenApiPage documentUrl="/api/apidoc/appopenapi.json" defaultOpenAllTags />;
}

// 禁用静态生成
export async function getServerSideProps() {
  return {
    props: {}
  };
}

export default AppOpenApiDocPage;
