import type { NextApiRequest } from 'next';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import {
  createOneCollection,
  delCollection
} from '@fastgpt/service/core/dataset/collection/controller';
import { DatasetCollectionTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { NextAPI } from '@/service/middleware/entry';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { type CreateCollectionResponse } from '@/global/core/dataset/api';
import { addLog } from '@fastgpt/service/common/system/log';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { findCollectionAndChild } from '@fastgpt/service/core/dataset/collection/utils';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';

import { uploadExcel } from '@fastgpt/service/core/dataset/database/dative/client/dativeApiServer';
import type { Readable } from 'stream';
import {
  dativeUrl,
  createBucketSourceConfig
} from '@fastgpt/service/core/dataset/database/dative/utils';

export type CreateStructureCollectionResponse = CreateCollectionResponse & {
  overwritten?: boolean; // Whether overwrite operation was performed
  deletedCollectionId?: string; // Deleted old collection ID (only returned when overwritten)
};

async function handler(req: NextApiRequest): Promise<CreateStructureCollectionResponse> {
  if (!dativeUrl) {
    return Promise.reject(new Error('Dative service URL is not configured'));
  }

  // Extract datasetId and overwriteDuplicate from query
  const datasetId = req.query.datasetId as string;
  const overwriteDuplicate = req.query.overwriteDuplicate === 'true';

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

  let { file_id: fileId, rows, cols, filename } = result;

  addLog.debug('File processed by Dative', {
    fileId,
    filename,
    rows,
    cols
  });

  // Handle duplicate file name check
  let deletedCollectionId: string | undefined;
  let overwritten = false;

  // Check if file with same name exists
  // Note: 不检查 parentId，在整个 dataset 范围内检查重名，确保文件名全局唯一
  const existingCollection = await MongoDatasetCollection.findOne({
    datasetId: dataset._id,
    name: filename,
    type: DatasetCollectionTypeEnum.file
  });

  if (existingCollection) {
    if (overwriteDuplicate === true) {
      // Overwrite: delete old collection first
      deletedCollectionId = String(existingCollection._id);

      // Find all child collections
      const collections = await findCollectionAndChild({
        teamId,
        datasetId: dataset._id,
        collectionId: deletedCollectionId,
        fields: '_id teamId datasetId fileId metadata'
      });

      // Delete collection and related data (data and training records)
      await mongoSessionRun((session) =>
        delCollection({
          collections,
          delImg: true,
          delFile: true,
          session
        })
      );

      overwritten = true;

      addLog.info(
        `[StructureCollection] Overwritten collection: ${deletedCollectionId}, name: ${filename}`
      );
    } else {
      // No overwrite: add suffix to new file name
      const lastDotIndex = filename.lastIndexOf('.');
      const fileNameWithoutExt = lastDotIndex > 0 ? filename.substring(0, lastDotIndex) : filename;
      const fileExt = lastDotIndex > 0 ? filename.substring(lastDotIndex) : '';

      // Escape special regex characters
      const escapeRegex = (str: string) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const escapedBase = escapeRegex(fileNameWithoutExt);
      const escapedExt = escapeRegex(fileExt);

      // Query all existing files with suffix pattern in one request
      const existingNames = await MongoDatasetCollection.find({
        datasetId: dataset._id,
        name: { $regex: `^${escapedBase}\\(\\d+\\)${escapedExt}$` },
        type: DatasetCollectionTypeEnum.file
      })
        .select('name')
        .lean();

      // Find max suffix from existing names
      let maxSuffix = 0;
      const suffixRegex = new RegExp(`^${escapedBase}\\((\\d+)\\)${escapedExt}$`);
      for (const doc of existingNames) {
        const match = doc.name.match(suffixRegex);
        if (match) {
          const num = parseInt(match[1], 10);
          if (num > maxSuffix) maxSuffix = num;
        }
      }

      filename = `${fileNameWithoutExt}(${maxSuffix + 1})${fileExt}`;

      addLog.info(
        `[StructureCollection] Renamed duplicate file from '${result.filename}' to '${filename}'`
      );
    }
  }

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
    },
    ...(overwritten && { overwritten, deletedCollectionId })
  };
}
// Disable default body parser to handle multipart/form-data
export const config = {
  api: {
    bodyParser: false
  }
};
export default NextAPI(handler);
