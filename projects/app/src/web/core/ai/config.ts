import { GET, PUT, DELETE, POST } from '@/web/common/api/request';
import type { listResponse } from '@/pages/api/core/ai/model/list';
import type { updateBody } from '@/pages/api/core/ai/model/update';
import type { deleteQuery } from '@/pages/api/core/ai/model/delete';
import type {
  SystemModelDataType,
  SystemModelDocumentDataType
} from '@fastgpt/global/core/ai/model.schema';
import type { updateWithJsonBody } from '@/pages/api/core/ai/model/updateWithJson';
import type { updateDefaultBody } from '@/pages/api/core/ai/model/updateDefault';
import type { testQuery } from '@/pages/api/core/ai/model/test';

export const getSystemModelList = () => GET<listResponse>('/core/ai/model/list');
export const getSystemModelDetail = (modelId: string) =>
  GET<SystemModelDataType>('/core/ai/model/detail', { modelId });

export const getSystemModelDefaultConfig = (modelId: string) =>
  GET<SystemModelDocumentDataType>('/core/ai/model/getDefaultConfig', { modelId });

export const putSystemModel = (data: updateBody) => PUT('/core/ai/model/update', data);

export const deleteSystemModel = (data: deleteQuery) => DELETE('/core/ai/model/delete', data);

export const getModelConfigJson = () => GET<string>('/core/ai/model/getConfigJson');
export const putUpdateWithJson = (data: updateWithJsonBody) =>
  PUT('/core/ai/model/updateWithJson', data);

export const getTestModel = (data: testQuery) => GET('/core/ai/model/test', data);

export const putUpdateDefaultModels = (data: updateDefaultBody) =>
  PUT('/core/ai/model/updateDefault', data);
