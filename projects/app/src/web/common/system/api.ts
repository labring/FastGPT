import { GET, POST } from '@/web/common/api/request';
import type { GetSystemInitDataResponse } from '@fastgpt/global/openapi/common/system/api';
import type {
  GetModelCatalogResponse,
  GetSystemModelsResponse
} from '@fastgpt/global/openapi/core/ai/model/api';
import type {
  GetModelSummariesBody,
  GetModelSummariesResponse
} from '@fastgpt/global/openapi/core/ai/model/summary';
import type { OutLinkChatAuthProps } from '@fastgpt/global/support/permission/chat';
import type {
  CollaboratorListType,
  UpdateClbPermissionProps
} from '@fastgpt/global/support/permission/collaborator';

/** 批量详情接口；选择器调用时只提交当前一个模型 ID。 */
export const getUserModelSummaries = (body: GetModelSummariesBody) =>
  POST<GetModelSummariesResponse>('/core/ai/model/summary', body);

export const getSystemInitData = (bufferId?: string) =>
  GET<GetSystemInitDataResponse>('/common/system/getInitData', {
    bufferId
  });

export const getPublicModelList = () =>
  GET<GetSystemModelsResponse>('/core/ai/model/list', undefined, {
    deduplicate: true
  }).then((res) => res.models);

export const getPublicModelCatalog = () =>
  GET<GetSystemModelsResponse>('/core/ai/model/list', undefined, { deduplicate: true });

// model permissions

export const getModelCollaborators = (modelId: string) =>
  GET<CollaboratorListType>('/proApi/system/model/collaborator/list', {
    modelId
  });

export const updateModelCollaborators = (
  props: UpdateClbPermissionProps & { modelIds: string[] }
) => POST('/proApi/system/model/collaborator/update', props);

export const getUserModelCatalog = ({
  version,
  outLinkAuthData
}: {
  version?: string;
  outLinkAuthData?: OutLinkChatAuthProps;
} = {}) =>
  GET<GetModelCatalogResponse>(
    '/core/ai/model/catalog',
    {
      version,
      outLinkAuthData: outLinkAuthData ? JSON.stringify(outLinkAuthData) : undefined
    },
    { deduplicate: true }
  );

/* 活动 banner */
export const getOperationalAd = () =>
  GET<{ id: string; operationalAdImage: string; operationalAdLink: string }>(
    '/proApi/support/user/inform/getOperationalAd'
  );

export const getActivityAd = () =>
  GET<{ id: string; activityAdImage: string; activityAdLink: string }>(
    '/proApi/support/user/inform/getActivityAd'
  );
