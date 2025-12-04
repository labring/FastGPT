import type { NextApiRequest } from 'next';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { createOneCollection } from '@fastgpt/service/core/dataset/collection/controller';
import { DatasetCollectionTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { NextAPI } from '@/service/middleware/entry';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { type CreateCollectionResponse } from '@/global/core/dataset/api';
import { addLog } from '@fastgpt/service/common/system/log';

import { uploadExcel } from '@fastgpt/service/core/dataset/database/dative/client/dativeApiServer';
import type { Readable } from 'stream';
import {
  dativeUrl,
  createBucketSourceConfig
} from '@fastgpt/service/core/dataset/database/dative/utils';

async function handler(req: NextApiRequest): Promise<CreateCollectionResponse> {
  if (!dativeUrl) {
    return Promise.reject(new Error('Dative service URL is not configured'));
  }

  // Extract datasetId from query
  const datasetId = req.query.datasetId as string;
  if (!datasetId) {
    return Promise.reject('datasetId is required');
  }

  // Authenticate dataset access
  const { teamId, tmbId, dataset } = await authDataset({
    req,
    authToken: true,
    authApiKey: true,
    per: WritePermissionVal,
    datasetId: datasetId
  });

  // Validate Content-Type
  const contentType = req.headers['content-type'] || '';
  if (!contentType.includes('multipart/form-data')) {
    return Promise.reject(new Error('Content-Type must be multipart/form-data'));
  }

  // Upload Excel file using the new framework
  const result = await uploadExcel({
    fileStream: req as unknown as Readable,
    contentType,
    sourceConfig: createBucketSourceConfig(datasetId, teamId, tmbId)
  });

  const { file_id: fileId, rows, cols, filename } = result;

  addLog.debug('File processed by Dative', {
    fileId,
    filename,
    rows,
    cols
  });

  // Create collection in database
  const collection = await createOneCollection({
    name: filename,
    teamId,
    tmbId,
    datasetId: dataset._id,
    type: DatasetCollectionTypeEnum.file,
    fileId,
    metadata: {
      rows,
      cols
    }
  });

  addLog.debug('Collection created successfully', {
    collectionId: collection._id,
    filename
  });

  return {
    collectionId: collection._id,
    results: {
      insertLen: 0
    }
  };
}
// Disable default body parser to handle multipart/form-data
export const config = {
  api: {
    bodyParser: false
  }
};
export default NextAPI(handler);
