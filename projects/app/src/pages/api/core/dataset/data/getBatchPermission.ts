import type { NextApiRequest } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { DatasetErrEnum } from '@fastgpt/global/common/error/code/dataset';
import { parseHeaderCert } from '@fastgpt/service/support/permission/auth/common';
import { authDatasetByTmbId } from '@fastgpt/service/support/permission/dataset/auth';
import type { GetDatasetPermissionResponse as GetQuotePermissionResponse } from '@fastgpt/global/openapi/core/dataset/api';

export type GetBatchQuotePermissionBody = {
  ids: string[];
};

export type GetBatchQuotePermissionResponse = Record<
  string,
  GetQuotePermissionResponse | undefined
>;

async function handler(req: NextApiRequest): Promise<GetBatchQuotePermissionResponse> {
  const { ids } = req.body as GetBatchQuotePermissionBody;

  const idList = Array.isArray(ids) ? ids : [];
  if (idList.length === 0) {
    return {};
  }

  const { tmbId, isRoot } = await parseHeaderCert({ req, authToken: true, authApiKey: true });

  const results = await Promise.all(
    idList.map(async (datasetId) => {
      try {
        const { dataset } = await authDatasetByTmbId({
          tmbId,
          datasetId,
          per: ReadPermissionVal,
          isRoot
        });
        return {
          id: datasetId,
          result: {
            datasetName: dataset.name,
            permission: {
              hasReadPer: dataset.permission.hasReadPer,
              hasWritePer: dataset.permission.hasWritePer
            }
          } as GetQuotePermissionResponse
        };
      } catch (error) {
        if (error === DatasetErrEnum.unAuthDataset || error === DatasetErrEnum.unExist) {
          return {
            id: datasetId,
            result: {
              datasetName: '',
              permission: {
                hasWritePer: false,
                hasReadPer: false
              }
            } as GetQuotePermissionResponse
          };
        }
        return { id: datasetId, result: undefined };
      }
    })
  );

  return Object.fromEntries(results.map(({ id, result }) => [id, result]));
}

export default NextAPI(handler);
