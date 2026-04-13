import { NextAPI } from '@/service/middleware/entry';
import { type ApiRequestProps } from '@fastgpt/service/type/next';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { DatasetErrEnum } from '@fastgpt/global/common/error/code/dataset';
import {
  GetDatasetPermissionQuerySchema,
  GetDatasetPermissionResponseSchema,
  type GetDatasetPermissionResponse
} from '@fastgpt/global/openapi/core/dataset/api';

async function handler(req: ApiRequestProps): Promise<GetDatasetPermissionResponse> {
  const { id: datasetId } = GetDatasetPermissionQuerySchema.parse(req.query);

  try {
    const { permission, dataset } = await authDataset({
      req,
      authToken: true,
      authApiKey: true,
      datasetId,
      per: ReadPermissionVal
    });

    return GetDatasetPermissionResponseSchema.parse({
      datasetName: dataset.name,
      permission: {
        hasReadPer: permission.hasReadPer,
        hasWritePer: permission.hasWritePer
      }
    });
  } catch (error) {
    if (error === DatasetErrEnum.unAuthDataset) {
      return GetDatasetPermissionResponseSchema.parse({
        datasetName: '',
        permission: {
          hasWritePer: false,
          hasReadPer: false
        }
      });
    }

    return Promise.reject(error);
  }
}

export default NextAPI(handler);
