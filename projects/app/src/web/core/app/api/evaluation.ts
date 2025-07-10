import { DELETE, POST } from '@/web/common/api/request';
import type {
  deleteEvaluationQuery,
  deleteEvaluationResponse,
  deleteItemQuery,
  deleteItemResponse,
  listEvalItemsBody,
  listEvalItemsResponse,
  listEvaluationsBody,
  listEvaluationsResponse,
  rerunEvalItemBody,
  rerunEvalItemResponse,
  updateEvalItemBody,
  updateEvalItemResponse
} from '@fastgpt/global/core/app/evaluation/api';

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

  return POST(`/proApi/core/app/evaluation/create`, formData, {
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
  POST<listEvaluationsResponse>('/proApi/core/app/evaluation/list', data);

export const deleteEvaluation = (data: deleteEvaluationQuery) =>
  DELETE<deleteEvaluationResponse>('/proApi/core/app/evaluation/delete', data);

export const getEvalItemsList = (data: listEvalItemsBody) =>
  POST<listEvalItemsResponse>('/proApi/core/app/evaluation/listItems', data);

export const deleteEvalItem = (data: deleteItemQuery) =>
  DELETE<deleteItemResponse>('/proApi/core/app/evaluation/deleteItem', data);

export const rerunEvalItem = (data: rerunEvalItemBody) =>
  POST<rerunEvalItemResponse>('/proApi/core/app/evaluation/rerunItem', data);

export const updateEvalItem = (data: updateEvalItemBody) =>
  POST<updateEvalItemResponse>('/proApi/core/app/evaluation/updateItem', data);
