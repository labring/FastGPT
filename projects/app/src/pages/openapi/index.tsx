import NextHead from '@/components/common/NextHead';
import { ApiReferenceReact } from '@scalar/api-reference-react';
import { fastgptOpenApiDocument } from '@fastgpt/global/common/tsRest/fastgpt/openapi';

export default function OpenAPI() {
  const config = {
    content: fastgptOpenApiDocument
  };

  return (
    <>
      <NextHead title="OpenAPI" />
      <ApiReferenceReact configuration={config} />
    </>
  );
}
