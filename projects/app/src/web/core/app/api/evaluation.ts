import type {
  deleteEvaluationQuery,
  deleteEvaluationResponse
} from '@/pages/api/core/app/evaluation/delete';
import type {
  deleteItemQuery,
  deleteItemResponse
} from '@/pages/api/core/app/evaluation/deleteItem';
import type {
  listEvaluationsBody,
  listEvaluationsResponse
} from '@/pages/api/core/app/evaluation/list';
import type {
  listEvalItemsBody,
  listEvalItemsResponse
} from '@/pages/api/core/app/evaluation/listItems';
import type {
  rerunEvalItemBody,
  rerunEvalItemResponse
} from '@/pages/api/core/app/evaluation/rerunItem';
import type {
  updateEvalItemBody,
  updateEvalItemResponse
} from '@/pages/api/core/app/evaluation/updateItem';
import { GET, POST, PUT, DELETE } from '@/web/common/api/request';

export const postCreateEvaluation = ({
  file,
  name,
  agentModel,
  appId,
  percentListen
}: {
  file: File;
  name: string;
  agentModel: string;
  appId: string;
  percentListen: (percent: number) => void;
}) => {
  const formData = new FormData();
  formData.append('file', file, encodeURIComponent(file.name));
  formData.append('data', JSON.stringify({ name, agentModel, appId }));

  return POST(`/core/app/evaluation/create`, formData, {
    timeout: 600000,
    onUploadProgress: (e) => {
      if (!e.total) return;

      const percent = Math.round((e.loaded / e.total) * 100);
      percentListen?.(percent);
    },
    headers: {
      'Content-Type': 'multipart/form-data; charset=utf-8'
    }
  });
};

export const getEvaluationList = (data: listEvaluationsBody) =>
  POST<listEvaluationsResponse>('/core/app/evaluation/list', data);

export const deleteEvaluation = (data: deleteEvaluationQuery) =>
  DELETE<deleteEvaluationResponse>('/core/app/evaluation/delete', data);

export const getEvalItemsList = (data: listEvalItemsBody) =>
  POST<listEvalItemsResponse>('/core/app/evaluation/listItems', data);

export const deleteEvalItem = (data: deleteItemQuery) =>
  DELETE<deleteItemResponse>('/core/app/evaluation/deleteItem', data);

export const rerunEvalItem = (data: rerunEvalItemBody) =>
  POST<rerunEvalItemResponse>('/core/app/evaluation/rerunItem', data);

export const updateEvalItem = (data: updateEvalItemBody) =>
  POST<updateEvalItemResponse>('/core/app/evaluation/updateItem', data);
