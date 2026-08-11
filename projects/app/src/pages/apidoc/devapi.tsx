import { ScalarOpenApiPage } from '@/pageComponents/apidoc/ScalarOpenApiPage';
import { DevApiTagsMap } from '@fastgpt/global/openapi/tag';

function DevApiDocPage() {
  return (
    <ScalarOpenApiPage
      documentUrl="/api/apidoc/devapi.json"
      flattenedTagNames={[DevApiTagsMap.aiAuxiliary]}
      tagNameAliases={{ [DevApiTagsMap.commonOther]: '其他' }}
    />
  );
}

// 禁用静态生成
export async function getServerSideProps() {
  return {
    props: {}
  };
}

export default DevApiDocPage;
