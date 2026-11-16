import { ScalarOpenApiPage } from '@/pageComponents/apidoc/ScalarOpenApiPage';

function SystemOpenApiDocPage() {
  return (
    <ScalarOpenApiPage
      documentUrl="/api/apidoc/systemopenapi.json"
      flattenedTagNames={['知识库搜索']}
    />
  );
}

export default SystemOpenApiDocPage;
