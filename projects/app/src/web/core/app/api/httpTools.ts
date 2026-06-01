import { POST, PUT } from '@/web/common/api/request';
import type {
  CreateHttpToolsBodyType,
  GetApiSchemaByUrlBodyType,
  GetApiSchemaByUrlResponseType,
  RunHttpToolBodyType,
  RunHttpToolResponseType,
  UpdateHttpToolsBodyType,
  UpdateHttpToolsResponseType
} from '@fastgpt/global/openapi/core/app/httpTools/api';
import type { CreateAppResponseType } from '@fastgpt/global/openapi/core/app/common/api';

/* ============ http tools ============== */
export const getApiSchemaByUrl = (url: GetApiSchemaByUrlBodyType['url']) =>
  POST<GetApiSchemaByUrlResponseType>(
    '/core/app/httpTools/getApiSchemaByUrl',
    { url },
    {
      timeout: 30000
    }
  );

export const postCreateHttpTools = (data: CreateHttpToolsBodyType) =>
  POST<CreateAppResponseType>('/core/app/httpTools/create', data);

export const putUpdateHttpTool = (data: UpdateHttpToolsBodyType) =>
  PUT<UpdateHttpToolsResponseType>('/core/app/httpTools/update', data);

export const postRunHTTPTool = (data: RunHttpToolBodyType) =>
  POST<RunHttpToolResponseType>('/core/app/httpTools/runTool', data);
