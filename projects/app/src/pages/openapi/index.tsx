import { ApiReferenceReact } from '@scalar/api-reference-react';

import '@scalar/api-reference-react/style.css';

export default function OpenAPI() {
  return (
    <ApiReferenceReact
      configuration={{
        url: '/api/openapi'
      }}
    />
  );
}
