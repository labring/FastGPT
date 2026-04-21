import { GET, POST } from '@/web/common/api/request';
import type {
  CreateHttpToolsBodyType,
  CreateHttpToolsResponseType,
  GetApiSchemaByUrlResponseType,
  RunHttpToolBodyType,
  RunHttpToolResponseType,
  UpdateHttpToolsBodyType
} from '@fastgpt/global/openapi/core/app/httpTools/api';

/* ============ http tools ============== */
export const getApiSchemaByUrl = (url: string) =>
  POST<GetApiSchemaByUrlResponseType>(
    '/core/app/httpTools/getApiSchemaByUrl',
    { url },
    {
      timeout: 30000
    }
  );

export const postCreateHttpTools = (data: CreateHttpToolsBodyType) =>
  POST<CreateHttpToolsResponseType>('/core/app/httpTools/create', data);

export const putUpdateHttpTool = (data: UpdateHttpToolsBodyType) =>
  POST('/core/app/httpTools/update', data);

export const postRunHTTPTool = (data: RunHttpToolBodyType) =>
  POST<RunHttpToolResponseType>('/core/app/httpTools/runTool', data);
