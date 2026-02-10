import { NextAPI } from '@/service/middleware/entry';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { type NextApiRequest, type NextApiResponse } from 'next';

import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { getLogger, LogCategories } from '@fastgpt/service/common/logger';
const logger = getLogger(LogCategories.APP);

async function handler(req: NextApiRequest, _res: NextApiResponse) {
  await authCert({ req, authRoot: true });

  logger.info('更新所有 API 知识库');

  const datasets = await MongoDataset.find({
    type: {
      $in: [DatasetTypeEnum.apiDataset, DatasetTypeEnum.feishu, DatasetTypeEnum.yuque]
    }
  }).lean();

  for (const dataset of datasets) {
    logger.info('Migrating API dataset', { datasetId: dataset._id });
    await MongoDataset.updateOne(
      { _id: dataset._id },
      {
        $set: {
          apiDatasetServer: {
            ...(dataset.apiServer && { apiServer: dataset.apiServer }),
            ...(dataset.feishuServer && { feishuServer: dataset.feishuServer }),
            ...(dataset.yuqueServer && { yuqueServer: dataset.yuqueServer })
          }
        }
      }
    );
  }

  return { success: true };
}

export default NextAPI(handler);
