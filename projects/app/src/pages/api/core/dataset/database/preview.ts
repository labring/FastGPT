import type { NextApiRequest } from 'next';
import { authDatasetCollection } from '@fastgpt/service/support/permission/dataset/auth';
import { NextAPI } from '@/service/middleware/entry';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import { sqlQuery } from '@fastgpt/service/core/dataset/database/dative/client/dativeApiServer';
import type { PreviewDataResponse } from '@fastgpt/global/core/dataset/database/api';
import { DatasetCollectionTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { getDuckDBStoreConfig } from '@fastgpt/service/core/dataset/database/dative/utils';

async function handler(req: NextApiRequest): Promise<PreviewDataResponse> {
  // Extract collectionId from query or body
  const collectionId = req.query.collectionId as string;

  if (!collectionId) {
    return Promise.reject(CommonErrEnum.missingParams);
  }

  // Authenticate collection access
  const { collection } = await authDatasetCollection({
    req,
    authToken: true,
    authApiKey: true,
    collectionId,
    per: ReadPermissionVal
  });

  // Validate collection type
  if (collection.type !== DatasetCollectionTypeEnum.file) {
    return Promise.reject(new Error('Invalid collection type, expected file type'));
  }

  // Build SQL query
  const filename = collection.name;
  const sql = `SELECT * FROM "${filename.split('.')[0]}" LIMIT 20`;

  // Call Dative SQL query interface
  const { cols, data } = await sqlQuery({
    source_config: getDuckDBStoreConfig(collection.datasetId),
    sql: sql
  });

  // Extract rows and cols from collection metadata if available
  const rowCount = collection.metadata?.rows;
  const columnCount = collection.metadata?.cols;

  return {
    cols,
    data,
    rowCount: rowCount,
    columnCount: columnCount
  };
}

export default NextAPI(handler);
