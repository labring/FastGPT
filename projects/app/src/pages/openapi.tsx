import { ApiReferenceReact } from '@scalar/api-reference-react';
import '@scalar/api-reference-react/style.css';
import { Box } from '@chakra-ui/react';

function OpenAPIPage() {
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

export default OpenAPIPage;
