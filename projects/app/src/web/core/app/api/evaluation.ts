import { DELETE, POST } from '@/web/common/api/request';
import type {
  listEvalItemsBody,
  listEvaluationsBody,
  retryEvalItemBody,
  updateEvalItemBody
} from '@fastgpt/global/core/app/evaluation/api';
import type { evaluationType, listEvalItemsItem } from '@fastgpt/global/core/app/evaluation/type';
import type { PaginationResponse } from '@fastgpt/global/openapi/api';
import type { DeleteEvaluationItemQueryType } from '@fastgpt/global/openapi/core/app/evaluation/api';

export const postCreateEvaluation = ({
  file,
  name,
  evalModelId,
  appId,
  percentListen
}: {
  file: File;
  name: string;
  evalModelId: string;
  appId: string;
  percentListen: (percent: number) => void;
}) => {
  const formData = new FormData();
  formData.append('file', file, file.name);
  formData.append('data', JSON.stringify({ name, evalModelId, appId }));

  return POST(`/proApi/core/app/evaluation/create`, formData, {
    timeout: 600000,
    onUploadProgress: (e) => {
      if (!e.total) return;

      const percent = Math.round((e.loaded / e.total) * 100);
      percentListen?.(percent);
    }
  });
};

export const getEvaluationList = (data: listEvaluationsBody) =>
  POST<PaginationResponse<evaluationType>>('/proApi/core/app/evaluation/list', data);

export const deleteEvaluation = (data: { evalId: string }) =>
  DELETE('/proApi/core/app/evaluation/delete', data);

export const getEvalItemsList = (data: listEvalItemsBody) =>
  POST<PaginationResponse<listEvalItemsItem>>('/proApi/core/app/evaluation/listItems', data);

export const deleteEvalItem = (data: DeleteEvaluationItemQueryType) =>
  DELETE('/proApi/core/app/evaluation/deleteItem', data);

export const retryEvalItem = (data: retryEvalItemBody) =>
  POST('/proApi/core/app/evaluation/retryItem', data);

export const updateEvalItem = (data: updateEvalItemBody) =>
  POST('/proApi/core/app/evaluation/updateItem', data);
