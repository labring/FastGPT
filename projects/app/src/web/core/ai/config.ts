import { GET, PUT, DELETE } from '@/web/common/api/request';
import type { listResponse } from '@/pages/api/core/ai/model/list';
import type { updateBody } from '@/pages/api/core/ai/model/update';
import type { deleteQuery } from '@/pages/api/core/ai/model/delete';
import { SystemModelItemType } from '@fastgpt/service/core/ai/type';

export const getSystemModelList = () => GET<listResponse>('/core/ai/model/list');
export const getSystemModelDetail = (model: string) =>
  GET<SystemModelItemType>('/core/ai/model/detail', { model });

export const putSystemModel = (data: updateBody) => PUT('/core/ai/model/update', data);

export const deleteSystemModel = (data: deleteQuery) => DELETE('/core/ai/model/delete', data);
