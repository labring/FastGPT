import type { NextApiRequest, NextApiResponse } from 'next';
import { responseWriteController } from '@fastgpt/service/common/response';
import { getLogger, LogCategories } from '@fastgpt/service/common/logger';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { resolveReadableCollectionIds } from '@fastgpt/service/support/permission/collection/auth';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { findDatasetAndAllChildren } from '@fastgpt/service/core/dataset/controller';
import {
  checkExportDatasetLimit,
  updateExportDatasetLimit
} from '@fastgpt/service/support/user/utils';
import { NextAPI } from '@/service/middleware/entry';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { Types } from '@fastgpt/service/common/mongo';
import { readFromSecondary } from '@fastgpt/service/common/mongo/utils';
import type { DatasetDataSchemaType } from '@fastgpt/global/core/dataset/type';
import {
  datasetDataSystemIndexTypes,
  getDatasetDataExternalIndexes
} from '@fastgpt/global/core/dataset/data/utils';
import { sanitizeCsvField } from '@fastgpt/service/common/file/csv';
import { ExportDatasetQuerySchema } from '@fastgpt/global/openapi/core/dataset/api';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';

const logger = getLogger(LogCategories.MODULE.DATASET.DATA);

type DataItemType = {
  _id: string;
  q: string;
  a: string;
  indexes: DatasetDataSchemaType['indexes'];
  metadata?: Record<string, any>;
};

type ExportSchemaType = {
  maxIndexCount?: number;
  hasMetadata?: number;
};

async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  const { datasetId } = parseApiInput({ req, querySchema: ExportDatasetQuerySchema }).query;

  // 凭证校验
  const { teamId, tmbId, dataset } = await authDataset({
    req,
    authToken: true,
    datasetId,
    per: WritePermissionVal
  });

  await checkExportDatasetLimit({
    teamId,
    limitMinutes: global.feConfigs?.limit?.exportDatasetLimitMinutes
  });

  const datasets = await findDatasetAndAllChildren({
    teamId,
    datasetId,
    fields: '_id'
  });
  const datasetIds = datasets.map((d) => String(d._id));

  // 文件级权限：只导出当前成员可读的 Collection；undefined 表示无需过滤（团队 owner /
  // 全部 dataset 未启用 collection 权限）。folder 导出时按后代 dataset 各自的开关解析。
  const readableCollectionIds = await resolveReadableCollectionIds({
    teamId: String(teamId),
    datasetIds,
    tmbId: String(tmbId)
  });

  const match = {
    teamId: new Types.ObjectId(teamId),
    datasetId: { $in: datasetIds.map((id) => new Types.ObjectId(id)) },
    ...(readableCollectionIds
      ? { collectionId: { $in: readableCollectionIds.map((id) => new Types.ObjectId(id)) } }
      : {})
  };

  const [exportSchema] = await MongoDatasetData.aggregate<ExportSchemaType>(
    [
      { $match: match },
      { $limit: 50000 },
      {
        $project: {
          // 系统索引（default / imageEmbedding）不计入列数：它们由 q/a/图片自动生成，
          // 计入会让表头恒多出列，且回导时被当成用户索引重新写入。
          indexCount: {
            $size: {
              $filter: {
                input: { $ifNull: ['$indexes', []] },
                cond: { $not: { $in: ['$$this.type', datasetDataSystemIndexTypes] } }
              }
            }
          },
          hasMetadata: {
            $cond: [{ $eq: [{ $type: '$metadata' }, 'object'] }, 1, 0]
          }
        }
      },
      {
        $group: {
          _id: null,
          maxIndexCount: { $max: '$indexCount' },
          hasMetadata: { $max: '$hasMetadata' }
        }
      }
    ],
    { ...readFromSecondary }
  );

  const indexCount = exportSchema?.maxIndexCount || 0;
  const hasMetadata = exportSchema?.hasMetadata === 1;
  const headers = [
    'q',
    'a',
    ...Array.from({ length: indexCount }, () => 'index'),
    ...(hasMetadata ? ['metadata'] : [])
  ];

  res.setHeader('Content-Type', 'text/csv; charset=utf-8;');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename=${encodeURIComponent(dataset.name)}-backup.csv;`
  );

  const cursor = MongoDatasetData.find<DataItemType>(match, 'q a indexes metadata', {
    ...readFromSecondary
  })
    .limit(50000)
    .cursor();

  const write = responseWriteController({
    res,
    readStream: cursor
  });

  write(`\uFEFF${headers.join(',')}`);

  cursor.on('data', (doc: DataItemType) => {
    const sanitizedQ = sanitizeCsvField(doc.q || '');
    const sanitizedA = sanitizeCsvField(doc.a || '');
    const exportIndexes = getDatasetDataExternalIndexes(doc.indexes);
    const sanitizedIndexes = Array.from({ length: indexCount }, (_, index) =>
      sanitizeCsvField(exportIndexes[index]?.text || '')
    );
    const sanitizedMetadata = hasMetadata
      ? [sanitizeCsvField(doc.metadata ? JSON.stringify(doc.metadata) : '')]
      : [];

    write(`\n${[sanitizedQ, sanitizedA, ...sanitizedIndexes, ...sanitizedMetadata].join(',')}`);
  });

  cursor.on('end', () => {
    cursor.close();
    res.end();
  });

  cursor.on('error', (err) => {
    logger.error(`export dataset error`, { error: err });
    res.status(500);
    res.end();
  });

  updateExportDatasetLimit(teamId);
}

export default NextAPI(handler);

export const config = {
  api: {
    responseLimit: '100mb'
  }
};
