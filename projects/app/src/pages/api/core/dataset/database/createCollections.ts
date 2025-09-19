import type { NextApiRequest, NextApiResponse } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { createOneCollection } from '@fastgpt/service/core/dataset/collection/controller';
import {
  DatasetCollectionTypeEnum,
  DatasetCollectionDataProcessModeEnum,
  TrainingModeEnum
} from '@fastgpt/global/core/dataset/constants';
import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import { createTrainingUsage } from '@fastgpt/service/support/wallet/usage/controller';
import { UsageSourceEnum } from '@fastgpt/global/support/wallet/usage/constants';
import { getEmbeddingModel } from '@fastgpt/service/core/ai/model';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { addLog } from '@fastgpt/service/common/system/log';
import type { DatasetSchemaType, TableSchemaType } from '@fastgpt/global/core/dataset/type';
import { i18nT } from '@fastgpt/web/i18n/utils';
import type {
  CreateDatabaseCollectionsBody,
  CreateDatabaseCollectionsResponse
} from '@fastgpt/global/core/dataset/database/api';
import {
  RequestValidationDiagnosisError,
  TableTransformer
} from '@fastgpt/service/core/dataset/database/model/dataModel';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';

// Create collections and training tasks for database tables
async function CreateDatabaseCollections(
  teamId: string,
  tmbId: string,
  dataset: DatasetSchemaType,
  { datasetId, tables }: CreateDatabaseCollectionsBody
): Promise<Array<string>> {
  const collectionIds: string[] = [];
  const tableNames = tables.map((table) => table.tableName);
  if (tables.length !== new Set(tableNames).size)
    return Promise.reject(i18nT('database_client:tableNamesDuplicate'));
  const mongoTable = await MongoDatasetCollection.find(
    {
      teamId,
      tmbId,
      datasetId,
      type: DatasetCollectionTypeEnum.table,
      'tableSchema.tableName': { $in: tableNames }
    },
    'tableSchema.tableName'
  ).lean();
  if (mongoTable?.some((table) => tableNames.includes(table.tableSchema?.tableName ?? '')))
    return Promise.reject(i18nT('database_client:tableNamesDuplicate'));
  try {
    await mongoSessionRun(async (session) => {
      for (const table of tables) {
        // convert to DBTable object: check table info
        const dbTable = TableTransformer.fromPlainObject(table);
        const collection = await createOneCollection({
          teamId,
          tmbId,
          datasetId,
          parentId: undefined,
          type: DatasetCollectionTypeEnum.table,
          name: table.tableName,
          trainingType: DatasetCollectionDataProcessModeEnum.databaseSchema,
          tableSchema: TableTransformer.toPlainObject(dbTable, {
            exist: table.exist ?? true,
            lastUpdated: new Date()
          }) as TableSchemaType,
          forbid: table.forbid,
          session
        });

        const { billId } = await createTrainingUsage({
          teamId,
          tmbId,
          appName: table.tableName,
          billSource: UsageSourceEnum.training,
          vectorModel: getEmbeddingModel(dataset.vectorModel)?.name,
          session
        });

        // if (table.forbid) continue;
        await MongoDatasetTraining.create(
          [
            {
              teamId,
              tmbId,
              datasetId,
              collectionId: collection._id,
              billId,
              mode: TrainingModeEnum.databaseSchema,
              retryCount: 5
            }
          ],
          { session }
        );

        collectionIds.push(collection._id);
      }
    });
    return collectionIds;
  } catch (error: any) {
    if (error instanceof RequestValidationDiagnosisError) {
      addLog.error('CreateDatabaseCollections error', error.message);
      return Promise.reject(i18nT('database_client:illeagal_table_info'));
    }
    addLog.error('CreateDatabaseCollections error', error);
    return Promise.reject(i18nT('dataset:error_create_datasetcollection'));
  }
}

async function handler(
  req: ApiRequestProps<CreateDatabaseCollectionsBody, {}>
): Promise<CreateDatabaseCollectionsResponse> {
  const { datasetId, tables } = req.body;

  const { teamId, tmbId, dataset } = await authDataset({
    req,
    authToken: true,
    authApiKey: true,
    datasetId,
    per: WritePermissionVal
  });

  const collectionIds = await CreateDatabaseCollections(teamId, tmbId, dataset, {
    datasetId,
    tables
  });

  return {
    collectionIds
  };
}

export default NextAPI(handler);
