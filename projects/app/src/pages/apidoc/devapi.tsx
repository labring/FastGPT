import { ScalarOpenApiPage } from '@/pageComponents/apidoc/ScalarOpenApiPage';
import { serviceSideProps } from '@/web/common/i18n/utils';
import { DevApiTagsMap } from '@fastgpt/global/openapi/tag';
import { useClientTranslation } from '@fastgpt/web/i18n/useClientTranslation';

function DevApiDocPage() {
  const { t } = useClientTranslation();

  return (
    <ScalarOpenApiPage
      documentUrl="/api/apidoc/devapi.json"
      flattenedTagNames={[DevApiTagsMap.aiAuxiliary]}
      tagNameAliases={{ [DevApiTagsMap.commonOther]: t('common:Other') }}
    />
  );
}

// 禁用静态生成
export async function getServerSideProps(context: any) {
  return {
    props: {
      ...(await serviceSideProps(context))
    }
  };
}

export default DevApiDocPage;
