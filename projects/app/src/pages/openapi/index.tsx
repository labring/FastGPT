import NextHead from '@/components/common/NextHead';
import { contract } from '@fastgpt/global/common/tsRest/fastgpt/contracts';
import { generateOpenApiDocument } from '@fastgpt/global/common/tsRest/openapi';
import { ApiReferenceReact } from '@scalar/api-reference-react';

export default function OpenAPI() {
  const config = {
    content: generateOpenApiDocument(contract)
  };

  return (
    <>
      <NextHead title="OpenAPI" />
      <ApiReferenceReact configuration={config} />
    </>
  );
}
