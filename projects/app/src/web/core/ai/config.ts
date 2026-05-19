import { GET, PUT, DELETE, POST } from '@/web/common/api/request';
import type { listResponse, ModelListItem } from '@/pages/api/core/ai/model/list';
import type { updateBody } from '@/pages/api/core/ai/model/update';
import type { deleteQuery } from '@/pages/api/core/ai/model/delete';
import type { SystemModelItemType } from '@fastgpt/service/core/ai/type';
import type { updateWithJsonBody } from '@/pages/api/core/ai/model/updateWithJson';
import type { updateDefaultBody } from '@/pages/api/core/ai/model/updateDefault';
import type { testQuery } from '@/pages/api/core/ai/model/test';
import type { createBody } from '@/pages/api/core/ai/model/create';
import type { listBody } from '@/pages/api/core/ai/model/list';

type PaginatedModelListBody = listBody & { pageNum: number; pageSize: number };
type ModelListPage = { list: ModelListItem[]; total: number };

export function getSystemModelList(data: PaginatedModelListBody): Promise<ModelListPage>;
export function getSystemModelList(data?: listBody): Promise<ModelListItem[]>;
export function getSystemModelList(data: listBody = {}) {
  return POST<listResponse>('/core/ai/model/list', data);
}
export const getSystemModelDetail = (id: string) =>
  GET<SystemModelItemType>('/core/ai/model/detail', { id });

export const getSystemModelDefaultConfig = (modelId: string) =>
  GET<SystemModelItemType>('/core/ai/model/getDefaultConfig', { modelId });

export const putSystemModel = (data: updateBody) => PUT('/core/ai/model/update', data);

export const postSystemModel = (data: createBody) => POST('/core/ai/model/create', data);

export const deleteSystemModel = (data: deleteQuery) => DELETE('/core/ai/model/delete', data);

export const getModelConfigJson = () => GET<string>('/core/ai/model/getConfigJson');
export const putUpdateWithJson = (data: updateWithJsonBody) =>
  PUT('/core/ai/model/updateWithJson', data);

export const getTestModel = (data: testQuery) => GET('/core/ai/model/test', data);

export const putUpdateDefaultModels = (data: updateDefaultBody) =>
  PUT('/core/ai/model/updateDefault', data);
