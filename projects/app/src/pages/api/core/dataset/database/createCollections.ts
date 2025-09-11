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
import { type CreateCollectionResponse } from '@/global/core/dataset/api.d';
type Query = {
  datasetId: string;
};
export type CreateDatabaseCollectionsBody = {
  tables: Array<{
    tableName: string;
    description: string;
    forbid: boolean;
    columns: Record<
      string,
      {
        columnName: string;
        columnType: string;
        description: string;
        examples: string[];
        forbid: boolean;
        valueIndex: boolean;
      }
    >;
    foreignKeys?: Array<{
      constrainedColumns: string[];
      referredSchema: string | null;
      referredTable: string;
      referredColumns: string[];
    }>;
    primaryKeys?: string[];
  }>;
};

export type CreateDatabaseCollectionsResponse = {
  collectionIds: string[];
};

async function handler(
  req: ApiRequestProps<CreateDatabaseCollectionsBody, Query>
): Promise<CreateDatabaseCollectionsResponse> {
  const { tables } = req.body;
  const { datasetId } = req.query;
  try {
    const { teamId, tmbId, dataset } = await authDataset({
      req,
      authToken: true,
      authApiKey: true,
      datasetId,
      per: WritePermissionVal
    });

    const collectionIds: string[] = [];
    const results: { insertLen: number }[] = [];

    await mongoSessionRun(async (session) => {
      for (const table of tables) {
        const collection = await createOneCollection({
          teamId,
          tmbId,
          datasetId,
          parentId: undefined,
          type: DatasetCollectionTypeEnum.table,
          name: table.tableName,
          trainingType: DatasetCollectionDataProcessModeEnum.databaseSchema,
          tableSchema: {
            tableName: table.tableName,
            description: table.description,
            columns: Object.fromEntries(
              Object.entries(table.columns).map(([name, col]) => [
                name,
                {
                  columnName: col.columnName,
                  columnType: col.columnType,
                  description: col.description,
                  examples: col.examples,
                  forbid: col.forbid,
                  valueIndex: col.valueIndex,
                  isPrimaryKey: table.primaryKeys?.includes(name) || false,
                  isForeignKey:
                    table.foreignKeys?.some((fk) => fk.constrainedColumns.includes(name)) || false,
                  relatedColumns: [],
                  metadata: {}
                }
              ])
            ),
            foreignKeys: table.foreignKeys || [],
            primaryKeys: table.primaryKeys || [],
            indexes: [],
            constraints: [],
            lastUpdated: new Date()
          },
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
        addLog.info(
          `Created database collection for table ${table.tableName}, training will be processed asynchronously`
        );
      }
    });

    addLog.info(
      `Successfully created ${collectionIds.length} database collections for dataset ${datasetId}`
    );

    return {
      collectionIds
    };
  } catch (err: any) {
    addLog.error('Failed to create database collections', err);
    return Promise.reject(err?.message || '创建数据库数据集失败');
  }
}

export default NextAPI(handler);
