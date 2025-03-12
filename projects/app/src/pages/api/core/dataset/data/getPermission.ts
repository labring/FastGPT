import type { NextApiRequest } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { DatasetErrEnum } from '@fastgpt/global/common/error/code/dataset';

export type GetQuotePermissionResponse =
  | {
      datasetName: string;
      permission: {
        hasWritePer: boolean;
        hasReadPer: boolean;
      };
    }
  | undefined;

async function handler(req: NextApiRequest): Promise<GetQuotePermissionResponse> {
  const { id: datasetId } = req.query as {
    id?: string;
  };
  if (!datasetId) {
    return Promise.reject('datasetId is required');
  }

  try {
    const { permission, dataset } = await authDataset({
      req,
      authToken: true,
      authApiKey: true,
      datasetId,
      per: ReadPermissionVal
    });

    return {
      datasetName: dataset.name,
      permission: {
        hasReadPer: permission.hasReadPer,
        hasWritePer: permission.hasWritePer
      }
    };
  } catch (error) {
    if (error === DatasetErrEnum.unAuthDataset) {
      return {
        datasetName: '',
        permission: {
          hasWritePer: false,
          hasReadPer: false
        }
      };
    }

    return Promise.reject(error);
  }
}

export default NextAPI(handler);
