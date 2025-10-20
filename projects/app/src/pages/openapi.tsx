'use client';
import { ApiReferenceReact } from '@scalar/api-reference-react';
import '@scalar/api-reference-react/style.css';
import { Box } from '@chakra-ui/react';
import { useEffect, useState } from 'react';

function OpenAPIPage() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // 仅在客户端渲染,避免 SSR 兼容性问题
  if (!mounted) {
    return null;
  }

  return (
    <Box w="100vw" h="100vh" overflow="auto">
      <ApiReferenceReact
        configuration={{
          hideDarkModeToggle: true,
          hideClientButton: true,
          theme: 'default',
          spec: {
            url: '/api/openapi.json'
          }
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
