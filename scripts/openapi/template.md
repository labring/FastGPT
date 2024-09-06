```ts
import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';

// This should be at the top of the file after the imports
export const ApiMetadata = {
  name: 'template example api',
  author: 'Finley',
  version: '0.1.0',
}

export type TemplateQuery = {
  // The App's ID
  appId?: string[],
  // The App's Name
  name: string,
  // The App's Description
  description: string | Something<AppDetailType>,
};

export type TemplateBody = {
  // The App's Name
  name: string,
};

// This is the response type for the API
export type TemplateResponse = AppDetailType;

// This is the template API for FASTGPT NextAPI
async function handler(
  req: ApiRequestProps<TemplateBody, TemplateQuery>,
  res: ApiResponseType<any>,
): Promise<TemplateResponse> {

  return {}
}

export default NextAPI(handler);

```
