import { ScalarOpenApiPage } from '@/pageComponents/apidoc/ScalarOpenApiPage';

function DevApiDocPage() {
  return (
    <ScalarOpenApiPage documentUrl="/api/apidoc/devapi.json" flattenedTagNames={['AI 辅助生成']} />
  );
}

// 禁用静态生成
export async function getServerSideProps() {
  return {
    props: {}
  };
}

export default DevApiDocPage;
