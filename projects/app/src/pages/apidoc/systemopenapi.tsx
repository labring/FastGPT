import { ScalarOpenApiPage } from '@/pageComponents/apidoc/ScalarOpenApiPage';

function SystemOpenApiDocPage() {
  return <ScalarOpenApiPage documentUrl="/api/apidoc/systemopenapi.json" />;
}

// 禁用静态生成
export async function getServerSideProps() {
  return {
    props: {}
  };
}

export default SystemOpenApiDocPage;
