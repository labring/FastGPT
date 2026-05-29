import { Box } from '@chakra-ui/react';
import dynamic from 'next/dynamic';
import { getScalarOpenApiReferenceConfig } from '@fastgpt/global/openapi/reference';

// 动态加载 @scalar/api-reference-react，避免其 CSS side-effect 在 Node 端
// (next build 的 collecting page data 阶段) 被解析导致 ERR_UNKNOWN_FILE_EXTENSION。
const ApiReferenceReact = dynamic(
  () => Promise.all([import('@scalar/api-reference-react')]).then(([mod]) => mod.ApiReferenceReact),
  { ssr: false }
);

function ApiDocPage() {
  return (
    <Box w="100vw" h="100vh" overflow="auto">
      <ApiReferenceReact configuration={getScalarOpenApiReferenceConfig('/api/devapidoc.json')} />
    </Box>
  );
}

// 禁用静态生成
export async function getServerSideProps() {
  return {
    props: {}
  };
}

export default ApiDocPage;
