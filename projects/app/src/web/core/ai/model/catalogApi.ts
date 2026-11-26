import { GET, POST } from '@/web/common/api/request';
import type {
  GetModelCatalogQuery,
  GetModelCatalogResponse,
  GetSystemModelsResponse
} from '@fastgpt/global/openapi/core/ai/model/api';
import type {
  GetModelSummariesBody,
  GetModelSummariesResponse
} from '@fastgpt/global/openapi/core/ai/model/summary';

const coreModelPath = '/core/ai/model';

export const getPublicModelList = () =>
  GET<GetSystemModelsResponse>(coreModelPath + '/list', undefined, { deduplicate: true }).then(
    (res) => res.models
  );
export const getPublicModelCatalog = () =>
  GET<GetSystemModelsResponse>(coreModelPath + '/list', undefined, { deduplicate: true });
export const getUserModelCatalog = ({
  version,
  outLinkAuthData,
  orderBy,
  includeSourceMember
}: GetModelCatalogQuery = {}) =>
  GET<GetModelCatalogResponse>(
    coreModelPath + '/catalog',
    {
      version,
      orderBy,
      includeSourceMember,
      outLinkAuthData: outLinkAuthData ? JSON.stringify(outLinkAuthData) : undefined
    },
    { deduplicate: true }
  );

/** 批量详情接口；选择器调用时只提交当前一个模型 ID。 */
export const getUserModelSummaries = (body: GetModelSummariesBody) =>
  POST<GetModelSummariesResponse>('/core/ai/model/summary', body);
