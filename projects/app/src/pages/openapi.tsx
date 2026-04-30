import { Box } from '@chakra-ui/react';
import dynamic from 'next/dynamic';

// 动态加载 @scalar/api-reference-react，避免其 CSS side-effect 在 Node 端
// (next build 的 collecting page data 阶段) 被解析导致 ERR_UNKNOWN_FILE_EXTENSION。
const ApiReferenceReact = dynamic(
  () => Promise.all([import('@scalar/api-reference-react')]).then(([mod]) => mod.ApiReferenceReact),
  { ssr: false }
);

function OpenAPIPage() {
  return (
    <Box w="100vw" h="100vh" overflow="auto">
      <ApiReferenceReact
        configuration={{
          hideDarkModeToggle: true,
          hideClientButton: true,
          theme: 'default',
          url: '/api/openapi.json'
        }}
      />
    </Box>
  );
}

// 禁用静态生成
export async function getServerSideProps() {
  return {
    props: {}
  };
}

export default OpenAPIPage;
